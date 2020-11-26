import { Message, MessageEmbed, TextChannel } from 'discord.js';
import Language from '../types/Language';
import { getConfigValues } from './ServerData';
import PostgreSQL from '../structures/PostgreSQL';
import { sendPlainEmbed, sendPrivateMessage } from './Commands';
import botCache from '../structures/BotCache';
import { log } from '../structures/Logging';

export const handleReportCreation = async (message: Message, language: Language, description: string) => {
    const guildData = await getConfigValues(message.guild.id, ['report_blacklist', 'report_channel'], false);

    const blacklist: string[] = JSON.parse(guildData.report_blacklist);
    if (blacklist.includes(message.author.id)) {
        await sendPlainEmbed(message.channel, botCache.config.colors.red, language.suggest.onBlacklist);
        await log(message.guild, language.logs.blacklistLogs.isOnReport.replace('%user_tag%', message.author.tag));
        return;
    }

    const channel = message.guild.channels.cache.get(guildData.report_channel);

    if (!channel || channel.type !== 'text') {
        await sendPlainEmbed(message.channel, botCache.config.colors.red, language.report.invalidChannel)
        return;
    }

    const idResult = await PostgreSQL.runQuery('SELECT id FROM reports ORDER BY id DESC LIMIT 1');
    const id = !idResult.rows.length ? 1 : 1 + idResult.rows[0].id;

    const rMessage = await (channel as TextChannel).send({
        embed: new MessageEmbed()
            .setAuthor(message.author.tag, message.author.avatarURL())
            .setColor(botCache.config.colors.blue)
            .setDescription(language.report.reportDescription
                .replace('%description%', description)
                .replace('%status%', language.additional.openStatus)
                .replace('%id%', id))
            .setTimestamp()
            .setFooter('Suggestions© 2020 - 2021')
    });

    await PostgreSQL.runQuery('INSERT INTO reports (context, author, guild, channel, message, status) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::int)', [description, message.author.id, message.guild.id, channel.id, rMessage.id, ReportStatus.OPEN]);

    await sendPrivateMessage(message.author, new MessageEmbed().setColor(botCache.config.colors.green).setDescription(
        language.report.reportSent.replace('%guild_name%', message.guild.name)
    ));
    await log(message.guild, language.logs.reportCreated.replace('%user_tag%', message.author.tag).replace('%mesage_url%', rMessage.url));
}

export const resolveReport = async (message: Message, language: Language, report: ReportData, reason?: string) => {
    const channel = message.guild.channels.cache.get(report.channel) as TextChannel;
    if (!channel) {
        await PostgreSQL.runQuery('UPDATE reports SET status = $1::int WHERE id = $2::int', [ReportStatus.DELETED, report.id]);
        return;
    }

    const msg = await channel.messages.fetch(report.message);
    if (!msg || msg.deleted) {
        await PostgreSQL.runQuery('UPDATE reports SET status = $1::int WHERE id = $2::int', [ReportStatus.DELETED, report.id]);
        return;
    }

    await PostgreSQL.runQuery('UPDATE reports SET status = $1::int WHERE id = $2::int', [ReportStatus.RESOLVED, report.id]);

    const embed = msg.embeds[0];
    embed.description = language.report.reportDescription
        .replace('%description%', report.context)
        .replace('%status%', reason ? `${language.additional.resolvedStatus} (${reason})` : language.additional.resolvedStatus)
        .replace('%id%', String(report.id));
    embed.color = parseInt(botCache.config.colors.green.slice(1), 16);

    await msg.edit({embed: embed});
}

export const getReportData = async (resolvable: string): Promise<ReportData> => {
    let result = await PostgreSQL.runQuery('SELECT context, author, guild, channel, message, status FROM reports WHERE id = $1::int', [parseInt(resolvable)]);
    if (!result.rows.length) {
        result = await PostgreSQL.runQuery('SELECT id, context, author, guild, channel, status FROM reports WHERE message = $1::text', [resolvable]);
        if (!result.rows.length) {
            result = null;
        }
    }
    return result.rows[0];
}

interface ReportData {
    id: number,
    context: string,
    author: string,
    guild: string,
    channel: string,
    message: string,
    status: number // See ReportStatus
}

export enum ReportStatus {
    OPEN,
    RESOLVED,
    DELETED
}