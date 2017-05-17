const moment = require('moment');
const _ = require('lodash');

class MafiaGame {
    constructor(bot) {
        this.bot = bot;
        this.loaded = false;
        this.loadDB();
    }

    loadDB() {
        this.bot.db.get('mafia').then(mafia_data => {
            this.data = mafia_data || {};

            let time = _.get(this.data, 'eod.time', null);

            if (time) {
                _.set(this.data, 'eod.time', moment(this.data.eod.time));
            } else {
                _.set(this.data, 'eod.time', null);
            }

            this.loaded = true;
        });
    }

    saveDB() {
        this.bot.db.put('mafia', this.data).catch(err => {
            this.bot.logger.severe('Cannot saveDB:');
            this.bot.logger.severe(err);
        });
    }

    buildVoteTable() {
        let vote_table = new Map();

        if (!this.data.votes) {
            return vote_table;
        }

        this.data.votes.forEach(vote => {
            if (!vote_table.has(vote.target)) {
                vote_table.set(vote.target, []);
            }

            vote_table.get(vote.target).push(vote.voter);
        });

        return vote_table;
    }

    checkMajority() {
        if (this.data.majority == 0) {
            return '0'; // No lynches on 0 majority.
        }

        let vote_table = this.buildVoteTable();

        for (let [key, value] of vote_table) {
            if (value.length >= this.data.majority) {
                return key;
            }
        }

        return '0';
    }

    buildVoteOutput() {
        let vote_table = this.buildVoteTable();
        let output = [];
        let primary_guild = this.bot.guilds.get(this.bot.config.primary_server);

        if (!primary_guild.available) {
            output.push(':negative_squared_cross_mark:  |  ERROR: Primary Server not available.');
            return;
        }

        output.push(':ballot_box: **Current Vote Count** :ballot_box:\n');

        if (vote_table.size === 0) {
            output.push('There are currently no votes.\n');
        }

        for (let [key, value] of vote_table) {
            let target;

            if (key === '0') {
                target = 'No Lynch';
            } else {
                let target_member = primary_guild.members.get(key);

                if (target_member) {
                    target = target_member.displayName;
                } else {
                    target = `Unknown User: ${key}`;
                }
            }

            output.push(`__**${target}**__ \`(${value.length})\``);

            value.forEach(voter => {
                output.push(primary_guild.members.get(voter).displayName);
            });

            output.push('');
        }

        if (this.data.majority > 0) {
            output.push(`*Majority is ${this.data.majority} votes.*`);
        }

        return output.join('\n');
    }

    startDay(hours) {
        let day_end = moment().add(hours, 'hours');
        let primary_server = this.bot.guilds.get(this.bot.config.primary_server);
        let alive_role = primary_server.roles.get(this.data.players.alive);

        _.set(this.data, 'eod.time', day_end);
        _.set(this.data, 'eod.day', true);
        _.set(this.data, 'votes', []);

        let num_players = alive_role.members.size;
        this.data.majority = Math.floor((num_players+2)/2);

        this.saveDB();
    }

    eod_check() {
        if (!this.loaded) {
            return;
        }

        if (!this.data.eod.day) {
            return;
        }

        let primary_server = this.bot.guilds.get(this.bot.config.primary_server);
        if (!(this.data.eod.time && this.data.eod.channel && primary_server.available)) {
            return;
        }

        let eod_channel = primary_server.channels.get(this.data.eod.channel);
        if (!eod_channel) {
            return;
        }

        if (this.data.eod.time.isBefore()) {
            let alive_role = primary_server.roles.get(this.data.players.alive);
            eod_channel.overwritePermissions(alive_role, {'SEND_MESSAGES': false});
            eod_channel.send(':exclamation:  **|  Majority was not reached before the end of the Day, so no one has been lynched.**\n\n:full_moon:  **|**  *The Night Phase will begin once a Mod posts the Night Start post.*');
            this.data.eod.day = false;
            this.bot.db.put('mafia.eod.day', this.data.eod.day);
        }
    }

    messageUpdate(oldMsg, newMsg) {
        let mods = this.data.mods;
        let channels = this.data.channels;
        if (!channels) return;
        if (!mods) return;
        if (oldMsg.author.bot) return; // #nope.
        if (oldMsg.content === newMsg.content) return; // lol embeds do this. srsly.

        if (channels.indexOf(oldMsg.channel.id) > -1 && mods.indexOf(oldMsg.author.id) < 0) {
            mods.forEach(modid => {
                let mod = this.bot.users.get(modid);
                mod.send(`This message from <@${oldMsg.author.id}> was edited in <#${oldMsg.channel.id}> on ${oldMsg.guild.name}: \n**Old**:`);
                mod.send(`\`\`\`${oldMsg.content}\`\`\``);
                mod.send('**New:**');
                mod.send(`\`\`\`${newMsg.content}\`\`\``);
            });
        }
    }

    messageDelete(msg) {
        let mods = this.data.mods;
        let channels = this.data.channels;
        if (!channels) return;
        if (!mods) return;
        if (msg.author.bot) return;

        if (channels.indexOf(msg.channel.id) > -1 && mods.indexOf(msg.author.id) < 0) {
            mods.forEach(modid => {
                let mod = this.bot.users.get(modid);
                mod.send(`This message from <@${msg.author.id}> was deleted in <#${msg.channel.id}> on ${msg.guild.name}:`);
                mod.send(`\`\`\`${msg.content}\`\`\``);
            });
        }
    }

    beautifyToMoment(time) {
        let categories = ['day', 'hour', 'minute', 'second'];
        let ret = [];

        let now = moment();

        if (!moment.isMoment(time)) {
            throw 'Must pass a moment';
        }

        let diff = moment.duration(time.diff(now));

        for (let i = 0; i < categories.length; i += 1) {
            let catName = categories[i];
            let catTime = diff.get(catName);

            if (catTime === 0) {
                continue;
            }

            if (catTime !== 1) {
                catName += 's';
            }

            ret.push(`${catTime} ${catName}`);
        }

        if (ret.length === 1) {
            return ret[0];
        } else if (ret.length === 2) {
            return `${ret[0]} and ${ret[1]}`;
        }

        let last = ret[ret.length - 1];
        ret[ret.length - 1] = `and ${last}`;

        return ret.join(', ');
    }

    timeToEOD() {
        let eod = _.get(this.data, 'eod.time', null);

        if (!moment.isMoment(eod)) {
            return '';
        }

        return this.beautifyToMoment(eod);
    }
}

module.exports = function(bot) { return new MafiaGame(bot); };
