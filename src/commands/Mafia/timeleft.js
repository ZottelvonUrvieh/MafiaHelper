exports.run = function (bot, msg) {
    if (bot.mafia.data.eod.day) {
        msg.channel.send(`:white_sun_cloud:  **|  The Day Phase will end ${bot.mafia.data.eod.time.fromNow()}.**`);
    } else {
        msg.channel.send(':x:  **|  There is no Day Phase currently.**');
    }
};

exports.info = {
    name: 'timeleft',
    usage: 'timeleft',
    description: 'Checks time left in day.'
};
