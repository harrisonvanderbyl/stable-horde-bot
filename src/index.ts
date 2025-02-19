import { Client, GatewayIntentBits, Partials, TextChannel } from "discord.js";

import "dotenv/config";
import humanizeDuration from "humanize-duration";

import config from "./config.js";
import { interactionHandlers } from "./interactions.js";
import User from "./models/User.js";
import KudosEscrow from "./models/KudosEscrow.js";
import { sendKudos } from "./util/sendKudos.js";
import { preCommand, inCommand, postCommand } from "./commandHooks.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Reaction, Partials.Message],
});

process.on("SIGTERM", async () => {
    if (config.status_notifications.enabled) {
        const channel = (await client.channels.fetch(
            config.status_notifications.channel
        )) as TextChannel;

        if (channel)
            await channel.send(config.status_notifications.messages.down);
    }

    process.exit();
});

client.on("ready", async () => {
    if (config.status_notifications.enabled) {
        const channel = (await client.channels.fetch(
            config.status_notifications.channel
        )) as TextChannel;

        if (channel)
            await channel
                .send(config.status_notifications.messages.up)
                .catch(console.error);
    }
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.isCommand()) {
        if (!interactionHandlers[interaction.commandName]) return;

        const hook = interactionHandlers[interaction.commandName].command;

        if (!hook) return;

        await preCommand(interaction, User, client);

        await Promise.all([
            hook(interaction, User, client),
            inCommand(interaction, User, client),
        ]);

        await postCommand(interaction, User, client);
    }

    if (interaction.isAutocomplete()) {
        if (!interactionHandlers[interaction.commandName]) return;

        const hook = interactionHandlers[interaction.commandName].autocomplete;

        if (!hook) return;

        await hook(interaction, User, client);
    }
});

client.on("messageReactionAdd", async (reaction, user) => {
    const emojiIdentifier = config.useEmojiNames
        ? reaction.emoji.name
        : reaction.emoji.id;

    const emojiDetails = config.emojis[emojiIdentifier || ""];

    if (!emojiDetails) return;

    const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;

    user = user.partial ? await user.fetch() : user;

    const isBotInteraction =
        message.author.id === client?.user?.id && Boolean(message.interaction);

    const author = isBotInteraction
        ? message.interaction!.user
        : message.author;

    if (author.id === user.id) {
        await reaction.users.remove(user);
        return;
    }

    const sender = await User.findById(user.id);

    const recipient = await User.findById(author.id);

    if (!sender || !recipient) {
        if (!sender) {
            user.createDM()
                .then((dm) =>
                    dm
                        .send(
                            "You are not logged in. Please use /login in the server."
                        )
                        .catch(console.error)
                )
                .catch(console.error);
            await reaction.users.remove(user).catch(console.error);
        } else if (!recipient) {
            await new KudosEscrow({
                from: user.id,
                to: author.id,
                emoji: emojiIdentifier,
                messageURL: message.url,
            }).save();

            author
                .createDM()
                .then((dm) =>
                    dm
                        .send(
                            `Someone has tried to give you kudos, but you are not logged in. Please use /login in the server within ${humanizeDuration(
                                config.escrowtime * 1000,
                                { largest: 2 }
                            )} to claim your kudos.`
                        )
                        .catch(console.error)
                )
                .catch(console.error);

            user.createDM()
                .then((dm) =>
                    dm
                        .send(
                            `<@${
                                author.id
                            }> is not logged in. If they log in within ${humanizeDuration(
                                config.escrowtime * 1000,
                                { largest: 2 }
                            )} they will receive the reward.`
                        )
                        .catch(console.error)
                )
                .catch(console.error);
        }

        return;
    }

    let sendEnabled = true;
    let receiveEnabled = true;

    if (sender.notifications) {
        if (sender.notifications.send === -1) sendEnabled = false;
        else if (sender.notifications.send > emojiDetails.value)
            sendEnabled = false;
    }

    if (recipient.notifications) {
        if (recipient.notifications.receive === -1) receiveEnabled = false;
        else if (recipient.notifications.receive > emojiDetails.value)
            receiveEnabled = false;
    }

    await sendKudos(
        client,
        User,
        { id: user.id, apiKey: sender.apiKey, sendDM: sendEnabled },
        {
            id: author.id,
            username: recipient.username,
            sendDM: receiveEnabled,
        },
        emojiIdentifier,
        message.url
    ).catch(console.error);
});

client.login(process.env.TOKEN);
