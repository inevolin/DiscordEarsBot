#!/bin/sh

kill -9 $(ps aux |grep ears.js | awk '{print $2}')
screen -wipe
