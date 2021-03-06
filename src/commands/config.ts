import { Client, Message, MessageEmbed, MessageReaction, User } from 'discord.js';

// Controller imports
import PrefixController from '../controllers/config/Prefix';
import LanguageController from '../controllers/config/Language';
import SuggestionChannelController from '../controllers/config/SuggestionChannel';
import ReportChannelController from '../controllers/config/ReportChannel';
import AutoApproveController from '../controllers/config/AutoApprove';
import AutoRejectController from '../controllers/config/AutoReject';
import DeleteApprovedController from '../controllers/config/DeleteAproved';
import DeleteRejectedController from '../controllers/config/DeleteRejected';

import botCache from '../structures/BotCache';

botCache.commands.set('config', {
    permission: 'ADMINISTRATOR',
    helpMessage: 'Configure the bot.',
    exec: async (client: Client, message: Message, language: any) => {
        const msg = await message.channel.send({
            embed: new MessageEmbed()
                .setAuthor(language.commands.config.title, client.user.avatarURL())
                .setColor(process.env.EMBED_COLOR)
                .setDescription(
                    `**1.** ${language.commands.config.names.prefix}
                    **2.** ${language.commands.config.names.language}
                    **3.** ${language.commands.config.names.suggestionChannel}
                    **4.** ${language.commands.config.names.reportChannel}
                    **5.** ${language.commands.config.names.autoApprove}
                    **6.** ${language.commands.config.names.autoReject}
                    **7.** ${language.commands.config.names.deleteApproved}
                    **8.** ${language.commands.config.names.deleteRejected}`
                )
                .setTimestamp()
                .setFooter(process.env.EMBED_FOOTER)
        });

        const reactions: any = {
            '1️⃣': PrefixController,
            '2️⃣': LanguageController,
            '3️⃣': SuggestionChannelController,
            '4️⃣': ReportChannelController,
            '5️⃣': AutoApproveController,
            '6️⃣': AutoRejectController,
            '7️⃣': DeleteApprovedController,
            '8️⃣': DeleteRejectedController
        }

        const reactionsArray: Array<string> = Object.keys(reactions);

        for (let i = 0; i < reactionsArray.length; i++) {
            msg.react(reactionsArray[i]);
        }

        const filter = (reaction: MessageReaction, user: User) => reactionsArray.includes(reaction.emoji.name) && user.id === message.author.id;
        const msgReactions = await msg.awaitReactions(filter, {
            max: 1,
            time: 50000
        });

        msg.reactions.removeAll();

        if (msgReactions.first()) {
            const controller = reactions[msgReactions.first().emoji.name]
            await controller(client, message, language, msg)
        }
    }
});