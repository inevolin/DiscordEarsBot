# DiscordEarsBot
A speech-to-text bot for Discord written in NodeJS.
Can be useful for hearing impaired and deaf people.

## Demo:

[![Discord Ears Bot Demo](http://img.youtube.com/vi/DoT2rdLymNc/0.jpg)](http://www.youtube.com/watch?v=DoT2rdLymNc "Discord Ears Bot Demo")

Try the bot for yourself on our Discord server: https://discord.gg/ApdTMG9

You can follow the steps below to get this bot up and running.

## Heroku (optional)
If you don't have a linux server/machine then you can use Heroku for hosting your bot 24/7 and it's free.
I wrote an easy step-by-step guide [here](https://medium.com/@ilyanevolin/deploying-my-discord-bots-on-heroku-105752941706).

## Docker (optional)
If you prefer using Docker instead of manually installing it:
1. Save the `Dockerfile`
2. Create a file `settings.json` and configure it (see Settings part)
3. run `docker build -t discordearsbot .`  this may take a minute or two.
4. run `docker run -it discordearsbot`
5. skip to Usage part.

## Installation
You need nodeJS version 12+ with npm on your machine.
```
sudo apt-get install -y sox screen
git clone https://github.com/healzer/DiscordEarsBot.git
cd DiscordEarsBot
npm install
```

## Settings
Create a (free) discord bot and obtain the API credentials (Bot Token). Here's an easy tutorial: https://www.writebots.com/discord-bot-token/ Note: Give your bot enough permissions or simply grant it Administrator rights.

Create a (free) WitAI account and obtain the API credentials (Server Access Token): https://wit.ai/

Rename the file `settings-sample.json` to `settings.json` and enter the obtained API credentials:
```
{
    "discord_token": "your_token",
    "wit_ai_token": "your_token"
}
```

## Running

Development mode (logging to console):
```
node index.js
```

Production mode (logging to screenlog file):
```
./restart.sh     # this (re)starts a new background screen session of the bot, closing your terminal will keep the process running.

./close.sh       # this closes the background screen session.
```

## Usage

By now you have a discord server, the DiscordEarsBot is running and is a part of your server. Make sure your server has a text and voice channel.

1. Enter one of your voice channels.
2. In one of your text channels type: `*join`, the bot will join the voice channel.
3. Everything said within that channel will be transcribed into text (as long as the bot is within the voice channel).
4. Type `*leave` to make the bot leave the voice channel.
5. Type `*help` for a list of commands.

### notes:
- When the bot is inside a voice channel it listens to all speech and transcribes audio into text.
- Each user is a separate audio channel, the bot hears everyone separately.
- Only when your user picture turns green in the voice channel will the bot receive your audio.
- A long pause interrupts the audio input.
- The duration of a single audio input is limited to 20 seconds, longer audio is not transcribed.

## Language
WitAI supports over 120 languages (https://wit.ai/faq), however only one language can be used at a time.
If you're not speaking English on Discord, then change your default language on your witAI account:

![Discord Ears Bot Demo](https://i.imgur.com/G19bGYe.png)

## For developers
Using Mozilla DeepSpeech for speech recognition, [tutorial](https://medium.com/@ilyanevolin/discord-stt-bot-using-mozilla-deepspeech-e77ee28937eb).

## Contact

For questions, feedback or issues feel free to get in touch with me.

Name: Ilya Nevolin

Email: ilja.nevolin@gmail.com

Discord: https://discord.gg/ApdTMG9
