#!/bin/sh

kill -9 $(ps aux |grep ears.js | awk '{print $2}')
screen -S nodeears -dmL node ears.js
screen -wipe
