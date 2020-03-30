# DiscordEarsBot
A speech-to-text bot for Discord written in NodeJS.
Can be useful for hearing impaired and deaf people.

## Demo:

[![Discord Ears Bot Demo](http://img.youtube.com/vi/DoT2rdLymNc/0.jpg)](http://www.youtube.com/watch?v=DoT2rdLymNc "Discord Ears Bot Demo")

You can follow the steps below to get this bot up and running.

## Installation
You need nodeJS version 12+ with npm on your machine.
```
git clone https://github.com/healzer/DiscordEarsBot.git
cd DiscordEarsBot
npm install
```

## Settings
Create a (free) discord bot and obtain the API credentials. Here's an easy tutorial: https://www.writebots.com/discord-bot-token/ Note: Give your bot enough permissions or simply grant it Administrator rights.

Create a (free) WitAI account and obtain the API credentials: https://wit.ai/

Rename the file settings-sample.json to settings.json and enter the obtained API credentials:
```
{
    "discord_token": "your_token",
    "wit_ai_token": "your_token"
}
```

##Running

Development mode (logging to console):
```
node voice.js
```

Production mode (logging to screenlog file):
```
./restart.sh     # this (re)starts a new background screen session of the bot, closing your terminal will keep the process running.

./close.sh       # this closes the background screen session.
```

##Usage
Usage

By now you have a discord server, the DiscordEarsBot is running and is a part of your server. Make sure your server has a text and voice channel.

1. Enter one of your voice channels.
2. In one of your text channels type: `*join`, the bot will join the voice channel.
3. Everything said within that channel will be transcribed into text (as long as the bot is within the voice channel).
4. Type `*leave` to make the bot leave the voice channel.
5. Type `*help` for a list of commands.
