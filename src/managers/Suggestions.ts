import { Message, MessageEmbed, TextChannel } from 'discord.js';
import Language from '../types/Language';
import { getConfigValue, getConfigValues } from './ServerData';
import PostgreSQL from '../structures/PostgreSQL';
import { sendPlainEmbed, sendPrivateMessage } from './Commands';
import botCache from '../structures/BotCache';
import { log } from '../structures/Logging';

export const handleSuggestionCreation = async (message: Message, language: Language, description: string) => {
    const guildData = await getConfigValues(message.guild.id, ['suggestion_blacklist', 'suggestion_channel'], false);

    // I did this here so we can don't have to get configuration from the database twice.
    if (guildData.suggestion_blacklist != null &&
        JSON.parse(guildData.suggestion_blacklist).includes(message.author.id)
    ) {
        await sendPlainEmbed(message.channel, botCache.config.colors.red, language.suggest.onBlacklist);
        await log(message.guild, language.logs.blacklistLogs.isOnSuggestion.replace('%user_tag%', message.author.tag));
        return;
    }

    const channel = message.guild.channels.cache.get(guildData.suggestion_channel);

    if (!channel || channel.type !== 'text') {
        await sendPlainEmbed(message.channel, botCache.config.colors.red, language.suggest.invalidChannel)
        return;
    }

    const idResult = await PostgreSQL.runQuery('SELECT id FROM suggestions ORDER BY id DESC LIMIT 1');
    const id = !idResult.rows.length ? 1 : 1 + idResult.rows[0].id;

    const sMessage = await (channel as TextChannel).send({
        embed: new MessageEmbed()
            .setAuthor(message.author.tag, message.author.avatarURL())
            .setColor(botCache.config.colors.blue)
            .setDescription(language.suggest.suggestionDescription
                .replace('%description%', description)
                .replace('%status%', language.additional.openStatus)
                .replace('%id%', id))
            .setTimestamp()
            .setFooter('Suggestions© 2020 - 2021')
    });

    const emojis = await getConfigValues(message.guild.id, ['approve_emoji', 'reject_emoji']);

    await sMessage.react(emojis.approve_emoji);
    await sMessage.react(emojis.reject_emoji);

    await PostgreSQL.runQuery('INSERT INTO suggestions (context, author, guild, channel, message, status) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::int)', [description, message.author.id, message.guild.id, channel.id, sMessage.id, SuggestionStatus.OPEN]);

    await sendPrivateMessage(message.author, new MessageEmbed().setColor(botCache.config.colors.green).setDescription(
        language.suggest.suggestionSent.replace('%guild_name%', message.guild.name).replace('%message_url%', sMessage.url)
    ));
    await log(message.guild, language.logs.suggestionCreated.replace('%user_tag%', message.author.tag).replace('%mesage_url%', sMessage.url));
}

export const approveSuggestion = async (message: Message, language: Language, suggestion: SuggestionData, reason?: string) => {
    const channel = message.guild.channels.cache.get(suggestion.channel) as TextChannel;
    if (!channel) {
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }

    const msg = await channel.messages.fetch(suggestion.message);
    if (!msg || msg.deleted) {
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }

    if (await getConfigValue(message.guild.id, 'delete_approved') as boolean) {
        await msg.delete();
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }

    await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.APPROVED, suggestion.id]);

    const embed = msg.embeds[0];
    embed.description = language.suggest.suggestionDescription
        .replace('%description%', suggestion.context)
        .replace('%status%', reason ? `${language.additional.approvedStatus} (${reason})` : language.additional.approvedStatus)
        .replace('%id%', String(suggestion.id));
    embed.color = parseInt(botCache.config.colors.green.slice(1), 16);

    await msg.edit({embed: embed});
}

export const rejectSuggestion = async (message: Message, language: Language, suggestion: SuggestionData, reason?: string) => {
    const channel = message.guild.channels.cache.get(suggestion.channel) as TextChannel;
    if (!channel) {
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }

    const msg = await channel.messages.fetch(suggestion.message);
    if (!msg || msg.deleted) {
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }
    if (await getConfigValue(message.guild.id, 'delete_rejected') as boolean) {
        await msg.delete();
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }

    await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.REJECTED, suggestion.id]);

    const embed = msg.embeds[0];
    embed.description = language.suggest.suggestionDescription
        .replace('%description%', suggestion.context)
        .replace('%status%', reason ? `${language.additional.rejectedStatus} (${reason})` : language.additional.rejectedStatus)
        .replace('%id%', String(suggestion.id));
    embed.color = parseInt(botCache.config.colors.green.slice(1), 16);

    await msg.edit({embed: embed});
}

export const considerSuggestion = async (message: Message, language: Language, suggestion: SuggestionData, reason?: string) => {
    const channel = message.guild.channels.cache.get(suggestion.channel) as TextChannel;
    if (!channel) {
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }

    const msg = await channel.messages.fetch(suggestion.message);
    if (!msg || msg.deleted) {
        await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.DELETED, suggestion.id]);
        return;
    }

    await PostgreSQL.runQuery('UPDATE suggestions SET status = $1::int WHERE id = $2::int', [SuggestionStatus.UNDER_CONSIDERATION, suggestion.id]);

    const embed = msg.embeds[0];
    embed.description = language.suggest.suggestionDescription
        .replace('%description%', suggestion.context)
        .replace('%status%', reason ? `${language.additional.considerstatus} (${reason})` : language.additional.considerstatus)
        .replace('%id%', String(suggestion.id));
    embed.color = parseInt(botCache.config.colors.green.slice(1), 16);

    await msg.edit({embed: embed});
}

export const getSuggestionData = async (resolvable: string): Promise<SuggestionData> => {
    let result = await PostgreSQL.runQuery('SELECT context, author, guild, channel, message, status FROM suggestions WHERE id = $1::int', [parseInt(resolvable)]);
    if (!result.rows.length) {
        result = await PostgreSQL.runQuery('SELECT id, context, author, guild, channel, status FROM suggestions WHERE message = $1::text', [resolvable]);
        if (!result.rows.length) {
            result = null;
        }
    }
    return result.rows[0];
}

interface SuggestionData {
    id: number,
    context: string,
    author: string,
    guild: string,
    channel: string,
    message: string,
    status: number // See SuggestionStatus
}

export enum SuggestionStatus {
    OPEN,
    APPROVED,
    UNDER_CONSIDERATION,
    REJECTED,
    DELETED
}