let members_with_role;
let confirm = false;
let role_assignment = [];
exports.run = function (bot, msg) {
    if (!msg.member.hasPermission('ADMINISTRATOR') && (bot.mafia.data.mods.indexOf(msg.author.id) < 0)) {
        msg.channel.send(':negative_squared_cross_mark:  |  You are not a game moderator.');
        return;
    }
    members_with_role = msg.guild.roles.get(bot.mafia.data.players.alive).members.array();
    bot.db.get('mafia.role_groups').then(loaded => {
        if (Object.prototype.toString.call(loaded) !== '[object Array]') {
            msg.edit('Was not able to load... You have to make a new `' + bot.config.prefix + 'setup`');
            return;
        }
        const role_groups = loaded;
        let result_string = '**The game groups are:**\n';
        for (let index = 0; index < role_groups.length; index++)
            result_string +=
                (index + 1) + ':' + role_groups[index][0] + 'x (' + role_groups[index][1].join(', ') + ')\n';
        msg.channel.send(result_string + 'Is that correct?')
           .then(
               tmp_msg => {
                   let collector = tmp_msg.createReactionCollector(
                       (_, user) => user.id === msg.author.id, {time: 500000}
                   );
                   collector.on(
                       'collect', reaction => _onReactionEventSendCancel(
                           bot, tmp_msg, reaction, collector, role_groups
                       )
                   );
                   tmp_msg.react('✅')
                          .then(tmp_msg.react('🇽'));
               }
           );
    });
};
// multi purpose function to get a role based on props (first match)
function _getRoleProp(bot, prop_name, prop_value) {
    for (let category in bot.config.mafia.roles)
        for (let role in bot.config.mafia.roles[category]) {
            // console.log(bot.config.mafia.roles[category][role][prop_value]);
            if (bot.config.mafia.roles[category][role][prop_name] === prop_value)
                return bot.config.mafia.roles[category][role];
        }
}

function _onReactionEventSendCancel(bot, tmp_msg, reaction, collector, role_groups) {
    if (reaction.emoji.name === '🇽') {
        tmp_msg.clearReactions();
        collector.stop();
        if (confirm) {
            bot.db.put('mafia.role_assignment', role_assignment);
        }
        return;
    }
    if (!confirm) {
        confirm = true;
        let result_string = '**These are the players:**\n';
        if (reaction.emoji.name === '✅') {
            result_string += members_with_role.join('\n');
            result_string += '\n**Roll roles NOW?**';
            tmp_msg.edit(result_string);
        }
    }
    else {
        role_assignment = [];
        let members_without_role = tmp_msg.guild.roles.get(bot.mafia.data.players.alive).members.array();
        // bot.db.get('mafia.role_groups').then(loaded => {let role_groups_roll = loaded;});
        let role_groups_roll = role_groups.slice(0);
        // console.log('Content of role_groups:\n' + JSON.stringify(role_groups));
        while(role_groups_roll.length > 0) {
            let role = role_groups[0];
            if (_impossible(role, role_assignment)) {
                tmp_msg.edit('Something went wrong during assigning the roles...\n' +
                             'Please check that there are no impossible groups (e.g. 2 groups with only a' +
                             ' Godfatherrole -> its an unique role so it can not work...)');
                tmp_msg.clearReactions();
                collector.stop();
                return;
            }
            let rand_role_number   = Math.floor(Math.random() * (role[1].length));
            let rand_player_number = Math.floor(Math.random() * (members_without_role.length));
            let random_role        = _getRoleProp(bot, 'name', role[1][rand_role_number]);
            let random_player      = members_without_role[rand_player_number];
            if (random_role.uniqueness === 'unique') {
                if (!_isIn(random_role, role_assignment)) {
                    role_assignment.push(role[1][rand_role_number]);
                    role[0]--;
                }
                role[1].splice(rand_role_number, 1);
            }
            else {
                role_assignment.push(role[1][rand_role_number]);
                role[0]--;
            }
            if (role[0] === 0) {
                role_groups.splice(0, 1);
            }
        }
        let result_string = '__**This is how the cookie crumbled:**__\n';
        for (let pair of role_assignment)
            result_string += pair[0] + ' --- ' + pair[1] + ' (possible was: ' + pair[2].join(', ') + ')\n';
        tmp_msg.edit(result_string + '\n✅ - to reroll\n🇽 - to keep this result');
    }
}

function _impossible(role, role_assignment) {
    if (!role || role.length === 0) return true;
    for (let tmp_role of role[1])
        if (tmp_role.uniqueness !== 'unique' || !_isIn(tmp_role, role_assignment))
            return false;
    return true;
}

function _isIn(elem, array) {
    for (let tmp_elem of array)
        if (elem === tmp_elem[1]) return true;
    return false;
}

exports.info = {
    name: 'roll',
    usage: 'roll',
    description: 'makes stuff happen'
};
