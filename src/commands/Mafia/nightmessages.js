const _ = require('lodash');
// const boti = require('../bot');

let msgs, killed_people, alive_players, current_state, game;

exports.run = function (bot, msg) {
    if (!msg.member.hasPermission('ADMINISTRATOR') && !bot.mafia.isMod(msg.author.id)) {
        msg.channel.send(':negative_squared_cross_mark:  |  You are not a game moderator.');
        return;
    }

    // The node.js default is 10 open listeners... I need one for each person + one for sending/canceling will be reset to 10 again at the end
    process.setMaxListeners(100);

    msgs = [], killed_people = [], current_state = 'editing_messages';
    alive_players = bot.mafia.getPlayers();
    _init_game(bot);

    // iterate over all alive players and send one message per player to the (secret) channel with emoji-reactions as menu
    msg.channel.send('__**----------- Night Message Menu -----------**__');
    for (let [, member] of alive_players) {
        msg.channel.send('**Send ' + member + ' (alias ' + member.displayName + ') following night message:**\nYou slept peacefully.')
           .then(tmp_msg => {
               msgs.push(tmp_msg.id);
               // reaction collector to log the emoji reactions
               let collector = tmp_msg.createReactionCollector((_, user) => [msg.author.id].concat(bot.mafia.getModsID()).indexOf(user.id) > -1, {time: 1800000});
               // save collector object associated with the message for later use
               msgs.push([tmp_msg.id, collector]);
               // create event - triggers every time an emoji get added
               collector.on('collect', reaction => _reactionEventMessageGroup(reaction, msg, bot));
               collector.on('end', () => { tmp_msg.clearReactions(); });
               // react with all in the config defined emojis
               _massReact(tmp_msg, _.map(game.messages, v => {return v.emoji;}));
           });
    }
    msg.channel.send(game.legend_text())  // send legend & send button + create reaction collector as above
       .then(tmp_msg => {
           _massReact(tmp_msg, [game.dialog.yes.emoji, game.dialog.no.emoji]);
           let collector = tmp_msg.createReactionCollector((a, user) => [msg.author.id].concat(bot.mafia.getModsID()).indexOf(user.id) > -1, {time: 1800000});
           msgs.push(['send/cancel', collector]);

           collector.on('collect', reaction => _reactionEventMessageSendCancel(reaction, bot));
           collector.on('end', reaction => {
               tmp_msg.clearReactions();
               if (reaction.message !== undefined && reaction.message.reactions.array().length === 0) {
                   tmp_msg.edit('\n\n**Menu timed out... are 30 minutes really not enough? Or did you just forgot to send/cancel?**');
               }
               else {
                   tmp_msg.edit('\n\n**Finished!**');
               }
           });
       });
};

function _massReact(message, reactions) {
    if (reactions.length > 0)
        message.react(reactions[0]).then(m => {
            'use strict';
            _massReact(message, reactions.slice(1));
        }).catch(console.error);
}

function _init_game(bot) {
    game = bot.utils.readJSON('mafiagame.json');

    // get the correct text to an emoji
    game.text_for_emote = function (emoji_name) {
        let test = _.map(game.messages, m => {return m;});
        return test.find(emo => {if (emo.emoji === emoji_name) return emo;}).text;
    };

    // construct text for displaying a legend of which emoji does what
    game.legend_text = function () {
        let test = _.map(game.messages, m => {return m;});
        return '\n\n\n**Legend:**\n' + test.map(msg => {return msg.emoji + ' : ' + msg.text;}).join('') + game.dialog.yes.text;
    };
}

// fires every time a reaction (emoji) from the command initiator is added to one of the messages
function _reactionEventMessageGroup(reaction, own_msg, bot) {
    let msg = reaction.message;
    if (reaction.emoji.name === game.messages.reset.emoji) {
        msg.edit(msg.content.split('\n')[0]);
        // This can be used to reset the emojis after pressing the reset emoji but it is more irritating than usefull imo...
        // for (let tmp_user of reaction.users.array()) {
        //     if (tmp_user === msg.author) continue; // ignore the emojis posted from the bot
        //     for (let tmp_reaction of msg.reactions.array())
        //         tmp_reaction.remove(tmp_user);
        // }
        return;
    } // Handling of custom messages - only accepts messages from the one who initiated the command
    if (reaction.emoji.name === game.messages.custom.emoji) {
        msg.channel.send('\n\n**Enter your custom message for **' + msg.mentions.users.array()[0])
           .then(send_msg => {
               msg.channel.awaitMessages(m => [own_msg.author.id].concat(bot.mafia.getModsID()).indexOf(m.author.id) > -1, {max: 1, time: 300000})
                  .then(collected => {
                      msg.edit(msg.content + '\n' + collected.array()[0]);
                      send_msg.delete();
                      collected.array()[0].delete();
                  });
           });
        return;
    }
    let content_addition = game.text_for_emote(reaction.emoji.name);
    if (!content_addition) return;
    msg.edit(msg.content + '\n' + content_addition);
}

// fires every time an reaction (emoji) form command initiator is added to the last message (legende + send/cancel)
function _reactionEventMessageSendCancel(reaction, bot) {
    let emo_name = reaction.emoji.name;
    if ([game.dialog.no.emoji, game.dialog.yes.emoji].indexOf(emo_name) < 0) return;

    // swich-casing over all the different states that can occur when hitting 'send' or 'cancel'
    if (current_state === 'editing_messages') {
        if (emo_name === game.dialog.no.emoji) {
            msgs.map(pair => pair[1].stop());
            return;
        }
        if (emo_name === game.dialog.yes.emoji) {
            let remaining_msgs = [];
            let waiting_promises = [];
            for (let i = 0; i < (msgs.length-1) * 3; i++) {
                waiting_promises.push(new Promise(resolve => setTimeout(resolve, 10000, 1)));
            }
            let index = 0;
            for (let pair of msgs) {
                // do not handle the send/cancel message here
                if (pair[0] === 'send/cancel') {
                    remaining_msgs.push(pair);
                    continue;
                }
                // refetch message b/c content could have been changed and then it would overwrite the already added content
                waiting_promises[index] = reaction.message.channel.fetchMessage(pair[0]);
                waiting_promises[index].then((tmp_msg) => {
                    let tmp_msg_content_array = tmp_msg.content.split('\n').splice(1);
                    let continue_function     = true;
                    if (tmp_msg_content_array.length === 0) {
                        console.log('Message not sent to ' + tmp_msg.mentions.users.array());
                        remaining_msgs.push(pair); // it is not possible to just .slice() the msgs because async sending...
                        continue_function = false; // kinda ugly way to do it... used to emulate a continue statement later on
                    }
                    if (continue_function) {
                        let recipient_id = tmp_msg.content.split('<@')[1].replace('!', '').split('>')[0]; // get user id the ugly way...
                        let recipient    = alive_players.get(recipient_id); // need to do this way because user we need members
                        if (_.filter(['you got killed', 'killed you', 'you were killed', 'you died'], e => {
                                return tmp_msg_content_array.join(' ').toLowerCase().includes(e);
                            }).length > 0) {
                            killed_people.push(recipient);
                        }
                        index++;
                        waiting_promises[index] = recipient.send(tmp_msg_content_array.join('\n'))
                                 .then(sent_msg => {
                                     index++;
                                     waiting_promises[index] = tmp_msg.edit('**Message successful sent to: ' + recipient + ' (alias ' + recipient.displayName + '):**\n' + sent_msg.content + '\n')
                                            .then(() => {
                                                pair[1].stop();
                                            }).catch(console.error);
                                 });
                    }
                });
            }
            msgs = remaining_msgs;
            Promise.all(waiting_promises).then(() => {
                if (msgs.length === 0 || (msgs.length === 1 && msgs[0][0] === 'send/cancel')) {
                    if (killed_people.length > 0) {
                        current_state = 'asked_roles';
                        reaction.message.edit('**Should the roles of the people that died be updated now?** *(-alive, +dead)\n(also shows a list first)*');
                    }
                    else {
                        reaction.message.edit('****At appears noone died today!** :)\n*If that is incorrcect you have to adjust their roles manually.*');
                    }
                }
            });
        }
    }
    else if (current_state === 'asked_roles' && emo_name === game.dialog.yes.emoji) {
        current_state = 'confirm_role_changes';
        reaction.message.edit('**Today died: ' + killed_people.join(' and ') + '\nCorrect? (If not no roles will be' + ' changed)**');
    }
    else if ((current_state === 'asked_roles' && emo_name === game.dialog.no.emoji) || current_state === 'confirm_role_changes') {
        current_state = 'asked_end_night';
        // Todo: Make it optional that it sends out the messages and starts the day by the scheduled night end...
        reaction.message.edit('**End the night now?**\nWill start a 24h day by default or 2h per additional emoji you react to this message with.');
        if (emo_name === game.dialog.yes.emoji) {
            for (let user of killed_people) {
                for (let member of alive_players) {
                    if (member.user === user) {
                        member.removeRole(bot.mafia.getRoleID()).catch(console.error);
                        member.addRole(bot.mafia.data.players.dead).catch(console.error);
                    }
                }
            }
        }
    }
    else if (current_state === 'asked_end_night') {
        if (emo_name === game.dialog.yes.emoji) {
            reaction.message.channel.fetchMessage(reaction.message.id)
                    .then(tmp_msg => {
                        let time = (tmp_msg.reactions.array().length - 2) * 2;
                        if (time <= 0) time = 24;
                        reaction.message.edit('**A ' + time + ' hour day will be started!**');
                        bot.commands.execute(reaction.message, bot.commands.get('startday'), time);
                    }).catch(console.error);
        }
        msgs.map(pair => pair[1].stop()); // stops all collectors and thus removes all emojis from all messages
        // let the bot time to update the msgs array - we dont need to rush the clearing of the emojis and listeners
        bot.setTimeout(() => {
            if (msgs.length === 0 || (msgs.length === 1 && msgs[0][0] === 'send/cancel')) {
                msgs.map(pair => pair[1].stop());
                process.setMaxListeners(10); // reset the maximum of event listeners back to node.js defaults 10

            }
        }, 5000);
    }
}

exports.info = {
    name       : 'nm',
    usage      : 'nm',
    description: '\n1. Shows a menue to send alive (or just killed) players messages what happend last/this night\n' +
                 '2. Tries to identify the player that died this night and can change their roles accordingly\n' +
                 '3. Can be used to initiate the next day immediatly after'
};
