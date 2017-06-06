exports.run = function (bot, msg, args) {
    bot.fetchUser(args[0]).then( user => {
        user.send(`The Medium sends you (${user.username}) a message:\n${args.slice(1).join(' ')}`);
    }).catch(console.error);
};

exports.info = {
    name: 'ano',
    usage: 'ano userid message',
    description: 'Send a message to an user anonymized through the bot'
};
