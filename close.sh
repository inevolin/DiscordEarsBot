#!/bin/sh

kill -9 $(ps aux |grep discordearsbot | awk '{print $2}')
screen -wipe
