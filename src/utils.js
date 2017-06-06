const bot = require('./bot');
const RichEmbed = require('discord.js').RichEmbed;
const fse = require('fs-extra');
const path = require('path');

exports.readJSON = function (filename) {
    try {
        console.log(__dirname + '../' + filename);
        return fse.readJsonSync(path.join(__dirname, '../' + filename));
    }
    catch (err) {
        if (err.name === 'SyntaxError') {
            bot.logger.severe('Configuration file is not valid JSON. Please verify it\'s contents.');
        } else if (err.code === 'ENOENT') {
            bot.logger.severe('Configuration not found. Make sure you copy config.json.example to config.json and fill it out.');
        } else {
            bot.logger.severe('Unknown error loading configuration file:');
            bot.logger.severe(err);
        }
    }
};

exports.randomSelection = (choices) => {
    return choices[Math.floor(Math.random() * choices.length)];
};

exports.randomColor = () => {
    return [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
};

exports.formatNumber = (number) => {
    if (isNaN(number)) return NaN;
    var input = `${number}`;
    if (number < 1e4) return input;
    var out = [];
    while (input.length > 3) {
        out.push(input.substr(input.length - 3, input.length));
        input = input.substr(0, input.length - 3);
    }
    return `${input},${out.reverse().join(',')}`;
};

const randomFooter = () => {
    return exports.randomSelection([
        'just add water!',
        'Powered by squirrels!',
        'codeisluvcodeislife',
        'Where did you get that?',
        'WHAT DID YOU BREAK!?',
        'D-D-D-DROP THE BASS',
        'Eat, Sleep, Dubstep',
        '#BlameRayzr522',
        'We get it, you vape.'
    ]);
};

exports.embed = (title, description = '', fields = [], options = {}) => {
    let url = options.url || '';
    let color = options.color || this.randomColor();

    if (options.inline) {
        if (fields.length % 3 === 2) {
            fields.push({ name: '\u200b', value: '\u200b' });
        }
        fields = fields.map(obj => { obj.inline = true; return obj; });
    }
    if (url !== '') description += '\n';

    return new RichEmbed({ fields, video: options.video || url })
        .setTitle(title)
        .setColor(color)
        .setDescription(description)
        .setImage(options.image || url)
        .setTimestamp(options.timestamp ? new Date() : null)
        .setFooter(options.footer === true ? randomFooter() : (options.footer ? options.footer : ''), options.footer ? bot.client.user.avatarURL : undefined)
        .setAuthor(options.author === undefined ? '' : options.author);
};

exports.parseArgs = (args, options) => {
    if (!options)
        return args;
    if (typeof options === 'string')
        options = [options];

    var optionValues = {};

    var i;
    for (i = 0; i < args.length; i++) {
        var arg = args[i];
        if (!arg.startsWith('-')) {
            break;
        }

        var label = arg.substr(1);

        if (options.indexOf(label + ':') > -1) {
            var leftover = args.slice(i + 1).join(' ');
            var matches = leftover.match(/^"(.+?)"/);
            if (matches) {
                optionValues[label] = matches[1];
                i += matches[0].split(' ').length;
            } else {
                i++;
                optionValues[label] = args[i];
            }
        } else if (options.indexOf(label) > -1) {
            optionValues[label] = true;
        } else {
            break;
        }
    }

    return {
        options: optionValues,
        leftover: args.slice(i)
    };
};

exports.multiSend = (channel, messages, delay) => {
    delay = delay || 100;
    messages.forEach((m, i) => {
        setTimeout(() => {
            channel.sendMessage(m);
        }, delay * i);
    });
};

exports.sendLarge = (channel, largeMessage, options = {}) => {
    var message = largeMessage;
    var messages = [];
    var prefix = options.prefix || '';
    var suffix = options.suffix || '';

    var max = 2000 - prefix.length - suffix.length;

    while (message.length >= max) {
        var part = message.substr(0, max);
        var cutTo = max;
        if (options.cutOn) {
            cutTo = part.lastIndexOf(options.cutOn);
            part = part.substr(0, cutTo);
        }
        messages.push(prefix + part + suffix);
        message = message.substr(cutTo);
    }

    if (message.length > 1) {
        messages.push(prefix + message + suffix);
    }

    this.multiSend(channel, messages, options.delay);
};

exports.now = () => {
    var now = process.hrtime();
    return now[0] * 1e3 + now[1] / 1e6;
};

exports.playAnimation = (msg, delay, list) => {
    if (list.length < 1)
        return;

    var next = list.shift();
    var start = this.now();

    msg.edit(next).then(() => {
        var elapsed = this.now() - start;

        setTimeout(() => {
            this.playAnimation(msg, delay, list);
        }, Math.max(50, delay - elapsed));
    }).catch(bot.client.logger.severe);
};
