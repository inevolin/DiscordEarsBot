#!/bin/sh

screen -SX discordearsbot quit
screen -S discordearsbot -dmL node index.js
screen -wipe
