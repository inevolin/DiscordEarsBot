#!/bin/sh

kill -9 $(ps aux |grep discordearsbot | awk '{print $2}')
screen -S discordearsbot -dmL node index.js
screen -wipe
