import ICommand from '../structures/ICommand';
import { Client, Message, MessageEmbed, TextChannel } from 'discord.js';
import pgPool from '../structures/PostgreSQL';

import RejectController from '../controllers/assessments/Reject';

/*
 * Listen for ID or 'all'
 */
export default class RejectCommand implements ICommand {

    aliases() {
        return ['deny'];
    }

    async run(client: Client, message: Message, language: any, args: string[]) {

        if (!message.member.permissions.has("MANAGE_MESSAGES")) return message.channel.send({
            embed: new MessageEmbed()
                .setAuthor(language.errorTitle, client.user.avatarURL())
                .setColor(process.env.EMBED_COLOR)
                .setDescription(language.insufficientPermissions
                    .replace(/<Permission>/g, "MANAGE_MESSAGES"))
                .setTimestamp()
                .setFooter(process.env.EMBED_FOOTER)
        });

        if (!args.length) return message.channel.send({
            embed: new MessageEmbed()
                .setAuthor(language.errorTitle, client.user.avatarURL())
                .setColor(process.env.EMBED_COLOR)
                .setDescription(language.commands.reject.descriptionRequired)
                .setTimestamp()
                .setFooter(process.env.EMBED_FOOTER)
        });

        const pgClient = await pgPool.connect();

        if (args[0].toLowerCase() === "all") {

            let result;

            try {
                result = await pgClient.query('SELECT message, channel FROM suggestions WHERE NOT status = $1::text', ['Deleted']);
            } finally {
                pgClient.release();
            }

            if (!result.rows.length) {
                message.channel.send({
                    embed: new MessageEmbed()
                        .setAuthor(language.errorTitle, client.user.avatarURL())
                        .setColor(process.env.EMBED_COLOR)
                        .setDescription(language.commands.reject.noSuggestionsFound)
                        .setTimestamp()
                        .setFooter(process.env.EMBED_FOOTER)
                });

                return;
            }

            for (let i = 0; i < result.rows.length; i++) {
                const chn: TextChannel = message.guild.channels.cache.get(result.rows[i].channel) as TextChannel;
                if (chn) {
                    try {
                        const msg = await chn.messages.fetch(result.rows[i].message, false);
                        RejectController(client, msg, language);
                    } catch (err) {
                        // throw err;
                    }
                }
            }

        } else {

            const sID = parseInt(args[0]);

            if (isNaN(sID)) {
                message.channel.send({
                    embed: new MessageEmbed()
                        .setAuthor(language.errorTitle, client.user.avatarURL())
                        .setColor(process.env.EMBED_COLOR)
                        .setDescription(language.commands.reject.invalidInput)
                        .setTimestamp()
                        .setFooter(process.env.EMBED_FOOTER)
                });

                await pgClient.release();

                return;
            }
            // let reason = "No reason provided";
            //
            // if (args.length > 1)
            //     reason = args.splice(1).join(" ");

            let result;

            try {
                result = await pgClient.query('SELECT message, channel FROM suggestions WHERE id = $1::int', [sID]);
            } finally {
                pgClient.release();
            }

            if (!result.rows.length) return message.channel.send({
                embed: new MessageEmbed()
                    .setAuthor(language.errorTitle, client.user.avatarURL())
                    .setColor(process.env.EMBED_COLOR)
                    .setDescription(language.commands.reject.invalidInput)
                    .setTimestamp()
                    .setFooter(process.env.EMBED_FOOTER)
            });

            const chn: TextChannel = message.guild.channels.cache.get(result.rows[0].channel) as TextChannel;
            if (chn) {
                try {
                    const msg = await chn.messages.fetch(result.rows[0].message, false);
                    RejectController(client, msg, language);
                } catch (err) {
                    // throw err;
                }
            }
        }

        message.channel.send({
            embed: new MessageEmbed()
                .setAuthor(language.commands.reject.title, client.user.avatarURL())
                .setColor(process.env.EMBED_COLOR)
                .setDescription(language.commands.reject.rejected)
                .setTimestamp()
                .setFooter(process.env.EMBED_FOOTER)
        });

    }

    help() {
        return "Reject a suggestion.";
    }

}
