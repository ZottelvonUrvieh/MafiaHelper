let finish_up, header_msg, accept_msg, author_id, group_player_count;
let roles = [], role_groups = [], selected_roles = [], collector_list = [], members_with_role = [];
let player_count = 0;

exports.run = function (bot, msg) {
    if (!msg.member.hasPermission('ADMINISTRATOR') && (bot.mafia.data.mods.indexOf(msg.author.id) < 0)) {
        msg.channel.send(':negative_squared_cross_mark:  |  You are not a game moderator.');
        return;
    }
    player_count = 0;
    author_id = msg.author.id;
    for (let role_category in bot.config.mafia.roles) { //noinspection JSUnfilteredForInLoop
        for (let rolename in bot.config.mafia.roles[role_category]) { //noinspection JSUnfilteredForInLoop
            roles.push(bot.config.mafia.roles[role_category][rolename]);
        }
    }
    members_with_role = msg.guild.roles.get(bot.mafia.data.players.alive).members.array();
    msg.channel.send('__**----------- Roles-Menu -----------**__\n' +
                     'Make sure everyone who wants to play is assigned to the alive role!\n' +
                     'Create groups of roles and declare how many player should be drawn/' +
                     'rolled out each group.\n' +
                     'You want to have Godfather in the game for sure? Add a one player group with' +
                     'a role \'Godfather\'.\n' +
                     'You want two player randomly assigned to Sheriff/Medium/Doctor but Sheriff must be unique? ' +
                     'Make a two player group with Sheriff, Medium and Doctor (and check the config.json which roles' +
                     ' are set to unique and stuff).\n' +
                     'Add more of the same role to a group to make those roles more likely. It is' +
                     ' just about ratios not about playercount!');
    _addRoleGroups(bot, msg);
};

function _addRoleGroups(bot, msg) {
    selected_roles = [];
    finish_up = false;
    group_player_count = 0;
    msg.channel.send('\n**Add roles to this group!**\n')
       .then(tmp_msg => {
           header_msg = tmp_msg;
           let collector2 = tmp_msg.createReactionCollector((_, user) => user.id === bot.user.id, {time: 1800000});
           tmp_msg.react(roles[0].emoji);
           collector2.on('collect', reaction => {
               if (reaction.message.reactions.array().length < roles.length)
                   tmp_msg.react(roles[reaction.message.reactions.array().length].emoji);
               else collector2.stop();
           });
           // reaction collector to log the emoji reactions
           let collector = tmp_msg.createReactionCollector((_, user) => user.id === author_id, {time: 1800000});
           // save collector object to close it later
           collector_list.push(['group', collector_list.length, collector]);
           // create event - triggers every time an emoji get added
           collector.on('collect', reaction => _reactionEventGroup(bot, tmp_msg, reaction));
       });

    msg.channel.send(
        '**0** Player will get rolled due to this group (0 to finish up)\nCurrent' +
        ' Player-Count: **' + player_count + '/' + members_with_role.length + '**\n\n' + _getLegend(bot)
    ).then(
            tmp_msg => {
                accept_msg = tmp_msg;
                tmp_msg.react('⏫')
                       .then(tmp_msg.react('✅'))
                       .then(tmp_msg.react('🇽'))
                       .then(tmp_msg.react('♻'));
                let collector = tmp_msg.createReactionCollector((_, user) => user.id === author_id, {time: 1800000});
                collector_list.push(['accept', collector_list.length, collector]);
                collector.on('collect', reaction => _onReactionEventSendCancel(bot, tmp_msg, reaction));
            }
    );

}
// multi purpose function to get a role based on props (first match)
function _getRoleProp(bot, prop_name, prop_value) {
    for (let category in bot.config.mafia.roles)
        for (let role in bot.config.mafia.roles[category]) {
            // console.log(bot.config.mafia.roles[category][role][prop_value]);
            if (bot.config.mafia.roles[category][role][prop_name] === prop_value)
                return bot.config.mafia.roles[category][role];
        }
}

function _reactionEventGroup(bot, msg, reaction) {
    selected_roles.push(_getRoleProp(bot, 'emoji', reaction.emoji.name).name);
    if (finish_up) {
        finish_up = false;
        accept_msg.edit('**' + group_player_count + '** Player will get rolled due to this group.' +
                 '\nCurrent Player-Count: **' + player_count + '/' + members_with_role.length + '**\n\n' + _getLegend(bot));
    }
    msg.edit('**Current roles in group:**\n' + selected_roles.map(role_name => {
        return '**' + role_name + '** (' + _getRoleProp(bot, 'name', role_name).label + ', ' + _getRoleProp(bot, 'name', role_name).uniqueness + ')';
    }).join(', '));
}

function _onReactionEventSendCancel(bot, msg, reaction) {
    if (reaction.emoji.name === '⏫') {
        finish_up = false;
        group_player_count++;
        player_count++;
        msg.edit('**' + group_player_count + '** Player will get rolled due to this group.' +
                 '\nCurrent Player-Count: **' + player_count + '/' + members_with_role.length + '**\n\n' + _getLegend(bot));
    }
    else if (reaction.emoji.name === '✅') {
        if (!finish_up && group_player_count > 0 && selected_roles.length > 0) {
            role_groups.push([group_player_count, selected_roles]);
            msg.clearReactions();
            msg.edit('**' + group_player_count + '** Player will get rolled due to this group.');
            header_msg.clearReactions();
            _stopOldestCollector('accept');
            _stopOldestCollector('group');
            _addRoleGroups(bot, msg);
            return;
        }
        let result_string = '**The game groups are:**\n';
        for (let index = 0; index < role_groups.length; index++)
            result_string += (index + 1) + ':' + role_groups[index][0] +'x (' + role_groups[index][1].join(', ') + ')\n';
        if (!finish_up) {
            finish_up = true;
            if (group_player_count === 0) result_string += '\n**If you just forgot to increment the playercount of the last group,' +
                             ' then do that now and continue making groups.**\n';
            else if (selected_roles.length === 0) result_string +=  '\n**You can NOT assign a player to an empty' +
                ' rolegoup! Add roles! NOW!**\n';
            result_string += '**Hit ✅ again to finish up.**';
            msg.edit(result_string);
        }
        else if (finish_up) {
            msg.edit(result_string + '**Alright roles for this game saved!**\n' +
                     'The next step would be to roll the roles! Do `' + bot.config.prefix + 'roll` to do so.');
            msg.clearReactions();
            for (let triple of collector_list)
                triple[2].stop();
            header_msg.delete();
            bot.db.put('mafia.role_groups', role_groups);
        }
    }
    else if (reaction.emoji.name === '♻') {
        bot.db.get('mafia.role_groups').then(loaded => {
            if (Object.prototype.toString.call(loaded) !== '[object Array]')
                role_groups = [];
            else role_groups = loaded;
        });
    }
    else if (reaction.emoji.name === '🇽') {
        msg.edit('Canceled!');
        msg.clearReactions();
        for (let triple of collector_list)
            triple[2].stop();
        header_msg.delete();
    }
}

function _stopOldestCollector(type) {
    let lowest_index = 999;
    for (let triple_index in collector_list){
        let triple = collector_list[triple_index];
        if ( triple[0] === type && triple[1] < lowest_index)
            lowest_index = triple[1];
    }
    if (lowest_index < 999) {
        collector_list[lowest_index][2].stop();
        collector_list.splice(lowest_index, 1);
    }
}

function _getLegend(bot) {
    let result_string = '__**Legend:**__\n';
    for (let role_category in bot.config.mafia.roles) //noinspection JSUnfilteredForInLoop
        for (let role in bot.config.mafia.roles[role_category]) //noinspection JSUnfilteredForInLoop
            result_string += bot.config.mafia.roles[role_category][role].emoji + ' = ' + role + ' ';
    return result_string;
}

exports.info = {
    name: 'setup',
    usage: 'setup',
    description: 'Displays a menu for setting up a game.'
};
