FROM ubuntu:latest

RUN mkdir /var/www/
RUN mkdir /var/www/DiscordEarsBot
WORKDIR /var/www/DiscordEarsBot

RUN apt -y update
RUN apt install -y git vim sox screen

RUN apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash -
RUN apt -y install nodejs

RUN git clone https://github.com/healzer/DiscordEarsBot.git .

COPY settings.json /var/www/DiscordEarsBot/settings.json

RUN npm install

CMD ["npm", "start"]