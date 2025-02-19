import fs from "fs";

type Config = {
    emojis: {
        [key: string]: {
            value: number;
            message: string | null | undefined;
        };
    };
    horde: {
        baseUrl: string;
        name: string;
    };
    autorole: {
        enabled: true;
        worker: { [key: string]: string };
        trusted: { [key: string]: string };
    };
    generate: {
        enabled: true;
        bannedWords: string[];
        nsfw: boolean;
    };
    status_notifications: {
        enabled: true;
        channel: string;
        messages: {
            up: string;
            down: string;
        };
    };
    escrowtime: number;
    defaultMessage: string;
    useEmojiNames: boolean;
    clientId: string;
};

const config: Config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));

export default config;
