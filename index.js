//////////////////////////////////////////
//////////////// LOGGING /////////////////
//////////////////////////////////////////
function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
};
let __originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};
//////////////////////////////////////////
//////////////////////////////////////////

const fs = require('fs');
const util = require('util');
const { Readable } = require('stream');
const { OpusEncoder } = require('@discordjs/opus');
const https = require('https')
const { Client, IntentsBitField, PermissionsBitField } = require('discord.js')
const { joinVoiceChannel, EndBehaviorType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const readline = require('readline');
const witClient = require('node-witai-speech');
const gspeech = require('@google-cloud/speech');

//////////////////////////////////////////
///////////////// VARIA //////////////////
//////////////////////////////////////////

function necessary_dirs() {
    if (!fs.existsSync('./data/')){
        fs.mkdirSync('./data/');
    }
}
necessary_dirs()

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function convert_audio(input) {
    try {
        // 48kHz 16-bit stereo -> 16kHz 16-bit mono: average L+R over each group of 3 frames (12 bytes);
        // the 3-frame box average doubles as a cheap anti-aliasing filter for the 3x decimation
        const frames = Math.floor(input.length / 12);
        const ndata = Buffer.alloc(frames * 2);
        for (let i = 0; i < frames; i++) {
            let sum = 0;
            for (let b = i * 12; b < i * 12 + 12; b += 2)
                sum += input.readInt16LE(b);
            ndata.writeInt16LE(Math.round(sum / 6), i * 2);
        }
        return ndata;
    } catch (e) {
        console.log(e)
        console.log('convert_audio: ' + e)
        throw e;
    }
}
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
//////////////// CONFIG //////////////////
//////////////////////////////////////////

const SETTINGS_FILE = 'settings.json';

let DISCORD_TOK = null;
let WITAI_TOK = null; 
let SPEECH_METHOD = 'whisper'; // witai, google, vosk, whisper

function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        const CFG_DATA = JSON.parse( fs.readFileSync(SETTINGS_FILE, 'utf8') );
        DISCORD_TOK = CFG_DATA.DISCORD_TOK;
        WITAI_TOK = CFG_DATA.WITAI_TOK;
        SPEECH_METHOD = CFG_DATA.SPEECH_METHOD;
    }
    DISCORD_TOK = process.env.DISCORD_TOK || DISCORD_TOK;
    WITAI_TOK = process.env.WITAI_TOK || WITAI_TOK;
    SPEECH_METHOD = process.env.SPEECH_METHOD || SPEECH_METHOD;

    if (!['witai', 'google', 'vosk', 'whisper'].includes(SPEECH_METHOD))
        throw 'invalid or missing SPEECH_METHOD'
    if (!DISCORD_TOK)
        throw 'invalid or missing DISCORD_TOK'
    if (SPEECH_METHOD === 'witai' && !WITAI_TOK)
        throw 'invalid or missing WITAI_TOK'
    if (SPEECH_METHOD === 'google' && !fs.existsSync('./gspeech_key.json'))
        throw 'missing gspeech_key.json'
    
}
loadConfig()

function listWitAIApps(cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps?offset=0&limit=100',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAI_TOK,
      },
    }

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })

    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.end()
}
function updateWitAIAppLang(appID, lang, cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps/' + appID,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAI_TOK,
      },
    }
    const data = JSON.stringify({
      lang
    })

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })
    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.write(data)
    req.end()
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

const myIntents = new IntentsBitField();
myIntents.add(
  IntentsBitField.Flags.GuildPresences,
  IntentsBitField.Flags.GuildVoiceStates,
  IntentsBitField.Flags.GuildMessages,
  IntentsBitField.Flags.MessageContent,
  IntentsBitField.Flags.Guilds,
  IntentsBitField.Flags.GuildMessageTyping);
const discordClient = new Client({intents: myIntents})
if (process.env.DEBUG)
    discordClient.on('debug', console.debug);
discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}!`)
})
discordClient.login(DISCORD_TOK)

const PREFIX = '*';
const _CMD_HELP        = PREFIX + 'help';
const _CMD_JOIN        = PREFIX + 'join';
const _CMD_LEAVE       = PREFIX + 'leave';
const _CMD_DEBUG       = PREFIX + 'debug';
const _CMD_TEST        = PREFIX + 'hello';
const _CMD_LANG        = PREFIX + 'lang';
const _CMD_STATUS      = PREFIX + 'status';

const guildMap = new Map();


discordClient.on('messageCreate', async (msg) => {
    try {
        if (!('guild' in msg) || !msg.guild) return; // prevent private messages to bot
        const mapKey = msg.guild.id;
        if (msg.content.trim().toLowerCase() == _CMD_JOIN) {
            if (!msg.member.voice.channel?.id) {
                msg.reply('Error: please join a voice channel first.')
            } else {
                if (!guildMap.has(mapKey))
                    await connect(msg, mapKey)
                else
                    msg.reply('Already connected')
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_LEAVE) {
            if (guildMap.has(mapKey)) {
                let val = guildMap.get(mapKey);
                if (val.voice_Connection) val.voice_Connection.destroy();
                guildMap.delete(mapKey)
                msg.reply("Disconnected.")
            } else {
                msg.reply("Cannot leave because not connected.")
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_HELP) {
            msg.reply(getHelpString());
        }
        else if (msg.content.trim().toLowerCase() == _CMD_DEBUG) {
            console.log('toggling debug mode')
            let val = guildMap.get(mapKey);
            if (val.debug)
                val.debug = false;
            else
                val.debug = true;
        }
        else if (msg.content.trim().toLowerCase() == _CMD_TEST) {
            msg.reply('hello back =)')
        }
        else if (msg.content.trim().toLowerCase() == _CMD_STATUS) {
            if (!msg.member?.permissions.has(PermissionsBitField.Flags.Administrator))
                msg.reply('Error: only server administrators can use this command.')
            else
                msg.reply(await get_status(mapKey))
        }
        else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() == _CMD_LANG) {
            if (SPEECH_METHOD === 'witai') {
              const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
              listWitAIApps(data => {
                if (!data.length)
                  return msg.reply('no apps found! :(')
                for (const x of data) {
                  updateWitAIAppLang(x.id, lang, data => {
                    if ('success' in data)
                      msg.reply('succes!')
                    else if ('error' in data && data.error !== 'Access token does not match')
                      msg.reply('Error: ' + data.error)
                  })
                }
              })
            } else if (SPEECH_METHOD === 'vosk' || SPEECH_METHOD === 'whisper') {
              let val = guildMap.get(mapKey);
              const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
              val.selected_lang = lang;
            } else {
              msg.reply('Error: this feature is only for Google')
            }
        }
    } catch (e) {
        console.log('discordClient message: ' + e)
        msg.reply('Error#180: Something went wrong, try again or contact the developers if this keeps happening.');
    }
})

function getHelpString() {
    let out = '**COMMANDS:**\n'
        out += '```'
        out += PREFIX + 'join\n';
        out += PREFIX + 'leave\n';
        out += PREFIX + 'lang <code>\n';
        out += PREFIX + 'status\n';
        out += '```'
    return out;
}

async function connect(msg, mapKey) {
    try {
        let voice_Channel = await discordClient.channels.fetch(msg.member.voice.channel.id);
        if (!voice_Channel) return msg.reply("Error: The voice channel does not exist!");
        let text_Channel = await discordClient.channels.fetch(msg.channel.id);
        if (!text_Channel) return msg.reply("Error: The text channel does not exist!");
        const voice_Connection = joinVoiceChannel({
          channelId: voice_Channel.id,
          guildId: voice_Channel.guild.id,
          adapterCreator: voice_Channel.guild.voiceAdapterCreator,
          selfDeaf: false,
				  selfMute: true,
        });
        // voice_Connection.play(new Silence(), { type: 'opus' });
        guildMap.set(mapKey, {
            'text_Channel': text_Channel,
            'voice_Channel': voice_Channel,
            'voice_Connection': voice_Connection,
            'selected_lang': 'en',
            'debug': false,
        });
        speak_impl(voice_Connection, mapKey)
        voice_Connection.on('disconnect', async(e) => {
            if (e) console.log(e);
            guildMap.delete(mapKey);
        })
        msg.reply('connected!')
    } catch (e) {
        console.log('connect: ' + e)
        msg.reply('Error: unable to join your voice channel.');
        throw e;
    }
}

let recs = {}
if (SPEECH_METHOD === 'vosk') {
  const vosk = require('vosk'); // loaded only when chosen, so whisper setups skip the native ffi bindings
  vosk.setLogLevel(-1);
  // MODELS: https://alphacephei.com/vosk/models
  recs = {
    'en': new vosk.Recognizer({model: new vosk.Model('vosk_models/en'), sampleRate: 16000}),
    // 'fr': new vosk.Recognizer({model: new vosk.Model('vosk_models/fr'), sampleRate: 16000}),
    // 'es': new vosk.Recognizer({model: new vosk.Model('vosk_models/es'), sampleRate: 16000}),
  }
  // download new models if you need
  // dev reference: https://github.com/alphacep/vosk-api/blob/master/nodejs/index.js
}

// faster-whisper runs in one long-lived Python process so the model stays warm and Node never blocks
let whisper = null;
let whisper_next_id = 0;
let whisper_started_at = null;
let whisper_restarts = 0;
const whisper_pending = new Map();
function start_whisper() {
  const python = process.env.WHISPER_PYTHON || (fs.existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
  whisper = spawn(python, ['whisper_worker.py'], { stdio: ['pipe', 'pipe', 'inherit'] });
  whisper_started_at = Date.now();
  whisper.on('error', e => console.log('whisper worker: ' + e));
  whisper.stdin.on('error', e => console.log('whisper stdin: ' + e));
  readline.createInterface({ input: whisper.stdout }).on('line', line => {
    let res;
    try { res = JSON.parse(line) } catch (e) { return console.log('whisper: ' + line) }
    const resolve = whisper_pending.get(res.id);
    whisper_pending.delete(res.id);
    if (resolve) resolve(res);
  });
  whisper.on('exit', code => {
    console.log('whisper worker exited (' + code + '), restarting in 5s');
    for (const resolve of whisper_pending.values()) resolve({ error: 'worker exited' });
    whisper_pending.clear();
    whisper_restarts++;
    setTimeout(start_whisper, 5000);
  });
}
if (SPEECH_METHOD === 'whisper') start_whisper();

function whisper_request(header, buffer = Buffer.alloc(0)) {
  return new Promise(resolve => {
    const id = whisper_next_id++;
    whisper_pending.set(id, resolve);
    whisper.stdin.write(JSON.stringify({ id, ...header, bytes: buffer.length }) + '\n');
    whisper.stdin.write(buffer);
  });
}

async function transcribe_whisper(buffer, lang) {
  if (!whisper.stdin.writable) return null;
  const res = await whisper_request({ lang }, buffer);
  if (res.error) {
    console.log('whisper error: ' + res.error);
    return null;
  }
  console.log('whisper:', res.text);
  return res.text;
}

async function get_status(mapKey) {
  const val = guildMap.get(mapKey);
  const lang = val ? val.selected_lang : 'en';
  let out = '**Speech method:** ' + SPEECH_METHOD + '\n';
  out += '**Language:** ' + lang + (val ? '' : ' (not connected)') + '\n';
  out += '**Bot RAM:** ' + Math.round(process.memoryUsage().rss / 1048576) + ' MB\n';
  if (SPEECH_METHOD === 'whisper') {
    const up = whisper.exitCode === null && whisper.stdin.writable;
    out += '**Worker:** ' + (up ? 'running' : 'NOT running (check pm2 logs)') + ', pid ' + whisper.pid
      + ', up ' + Math.round((Date.now() - whisper_started_at) / 60000) + ' min, restarts ' + whisper_restarts
      + ', queued clips ' + whisper_pending.size + '\n';
    if (!up) return out;
    const sent = Date.now();
    // waits behind queued clips, so the timing reflects real load; first start may still be loading the model
    const res = await Promise.race([
      whisper_request({ status: true }),
      sleep(20000).then(() => ({ error: 'no reply in 20 s (model still loading, or worker stuck)' })),
    ]);
    if (res.error) return out + '**Self-test:** FAILED: ' + res.error;
    out += '**Model:** ' + res.model + ' (' + res.compute_type + ', ' + res.cpu_threads + ' threads)'
      + (res.peak_rss_mb ? ', worker peak RAM ' + res.peak_rss_mb + ' MB' : '') + '\n';
    out += '**Self-test:** OK, 1 s test clip decoded in ' + res.infer_ms + ' ms (round trip ' + (Date.now() - sent) + ' ms)';
  } else if (SPEECH_METHOD === 'vosk') {
    let model = 'unknown';
    try { model = fs.readFileSync('vosk_models/en/README', 'utf8').split('\n')[0].trim() } catch (e) {}
    out += '**Model:** ' + model + ' (loaded: ' + Object.keys(recs).join(', ') + ')\n';
    if (!recs[lang]) return out + '**Self-test:** FAILED: no Vosk model loaded for "' + lang + '"';
    const sent = Date.now();
    recs[lang].acceptWaveform(Buffer.alloc(32000)); // 1 s of 16 kHz silence
    recs[lang].finalResult();
    out += '**Self-test:** OK, 1 s test clip decoded in ' + (Date.now() - sent) + ' ms';
  }
  return out;
}

function speak_impl(voice_Connection, mapKey) {
  const receiver = voice_Connection.receiver;
  receiver.speaking.on('start', async (userId) => {
    if (receiver.subscriptions.has(userId)) return; // already recording this user
    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 600,
      },
    });

    const encoder = new OpusEncoder(48000, 2);
    let buffer  = [];
    audioStream.on("data", chunk => {
      try {
        buffer.push( encoder.decode( chunk ) )
      } catch (e) {
        console.log('opus decode: ' + e) // drop the corrupt packet, keep the utterance
      }
    });
    audioStream.once("end", async () => { 
      
      buffer = Buffer.concat(buffer)
      const duration = buffer.length / 48000 / 4;
      console.log("duration: " + duration)
      
      if (SPEECH_METHOD === 'witai' || SPEECH_METHOD === 'google') {
        if (duration < 1.0 || duration > 19) { // 20 seconds max dur
            console.log("TOO SHORT / TOO LONG; SKPPING")
            return;
        }
      }

      try {
        let new_buffer = await convert_audio(buffer)
        let out = await transcribe(new_buffer, mapKey);
        if (out != null)
            process_commands_query(out, mapKey, await discordClient.users.fetch(userId));
      } catch (e) {
          console.log('transcribe: ' + e)
      }
    }); 

  });
}

function process_commands_query(txt, mapKey, user) {
    if (txt && txt.length) {
        let val = guildMap.get(mapKey);
        val.text_Channel.send(user.username + ': ' + txt)
    }
}


//////////////////////////////////////////
//////////////// SPEECH //////////////////
//////////////////////////////////////////
async function transcribe(buffer, mapKey) {
  if (SPEECH_METHOD === 'witai') {
      return transcribe_witai(buffer)
  } else if (SPEECH_METHOD === 'google') {
      return transcribe_gspeech(buffer)
  } else if (SPEECH_METHOD === 'vosk') {
      let val = guildMap.get(mapKey);
      recs[val.selected_lang].acceptWaveform(buffer);
      // finalResult() flushes and resets the recognizer, so trailing words don't bleed into the next utterance
      let ret = recs[val.selected_lang].finalResult().text;
      console.log('vosk:', ret)
      return ret;
  } else if (SPEECH_METHOD === 'whisper') {
      let val = guildMap.get(mapKey);
      return transcribe_whisper(buffer, val.selected_lang)
  }
}

// WitAI
let witAI_lastcallTS = null;
async function transcribe_witai(buffer) {
    try {
        // ensure we do not send more than one request per second
        if (witAI_lastcallTS != null) {
            let now = Math.floor(new Date());    
            while (now - witAI_lastcallTS < 1000) {
                console.log('sleep')
                await sleep(100);
                now = Math.floor(new Date());
            }
        }
    } catch (e) {
        console.log('transcribe_witai 837:' + e)
    }

    try {
        console.log('transcribe_witai')
        const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
        var stream = Readable.from(buffer);
        const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=16k;endian=little"
        const output = await extractSpeechIntent(WITAI_TOK, stream, contenttype)
        witAI_lastcallTS = Math.floor(new Date());
        console.log(output)
        stream.destroy()
        if (output && '_text' in output && output._text.length)
            return output._text
        if (output && 'text' in output && output.text.length)
            return output.text
        return output;
    } catch (e) { console.log('transcribe_witai 851:' + e); console.log(e) }
}

// Google Speech API
// https://cloud.google.com/docs/authentication/production
const gspeechclient = new gspeech.SpeechClient({
  projectId: 'discordbot',
  keyFilename: 'gspeech_key.json'
});

async function transcribe_gspeech(buffer) {
  try {
      console.log('transcribe_gspeech')
      const bytes = buffer.toString('base64');
      const audio = {
        content: bytes,
      };
      const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',  // https://cloud.google.com/speech-to-text/docs/languages
      };
      const request = {
        audio: audio,
        config: config,
      };

      const [response] = await gspeechclient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      console.log(`gspeech: ${transcription}`);
      return transcription;

  } catch (e) { console.log('transcribe_gspeech 368:' + e) }
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

