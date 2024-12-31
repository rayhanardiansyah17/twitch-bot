require('dotenv').config(); 
const tmi = require('tmi.js');
const axios = require('axios');
const sharp = require('sharp');
const OBSWebSocket = require('obs-websocket-js').default;
const express = require('express');
const fs = require('fs');

// Konfigurasi dari file .env
const twitchConfig = {
    username: process.env.BOT_USERNAME,
    password: process.env.BOT_PASSWORD,
    clientId: process.env.CLIENT_ID,
    oauthToken: process.env.API_OAUTH_TOKEN,
    channel: process.env.CHANNEL_NAME
};

const obsConfig = {
    address: process.env.OBS_ADDRESS,
    password: process.env.OBS_PASSWORD
};

// Bot Twitch
const client = new tmi.Client({
    options: { debug: true },
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: twitchConfig.username,
        password: twitchConfig.password
    },
    channels: [twitchConfig.channel]
});

// Fungsi untuk mengambil URL foto profil dari Twitch API
async function getUserProfileImage(username) {
    const headers = {
        'Client-ID': twitchConfig.clientId,
        'Authorization': `Bearer ${twitchConfig.oauthToken}`
    };

    try {
        const response = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, { headers });
        const userData = response.data.data[0]; // Ambil user pertama
        if (!userData) throw new Error('User tidak ditemukan');
        return userData.profile_image_url; // URL foto profil
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw error;
    }
}

// Fungsi untuk membuat poster buronan
async function createWantedPoster(username, profileImageUrl, outputPath) {
    const templatePath = 'poster_template.jpg'; // Path template poster

    try {
        const response = await axios.get(profileImageUrl, { responseType: 'arraybuffer' });
        const profilePic = Buffer.from(response.data);

        await sharp(templatePath)
            .composite([{ input: await sharp(profilePic).resize(200, 200).toBuffer(), top: 150, left: 100 }])
            .toFile(outputPath);

        console.log(`Poster buronan untuk ${username} berhasil dibuat!`);
    } catch (error) {
        console.error('Error creating poster:', error);
        throw error;
    }
}

// Fungsi untuk mengupdate gambar di OBS
async function updateObsImage(imagePath) {
    const obs = new OBSWebSocket();
    try {
        // Connect ke OBS WebSocket
        await obs.connect(`ws://${obsConfig.address}`, obsConfig.password);

        // Panggil metode untuk mengubah input settings
        await obs.call('SetInputSettings', {
            inputName: 'PosterSource', // Nama input di OBS
            inputSettings: { file: imagePath }
        });

        console.log('OBS updated with new poster!');
    } catch (error) {
        console.error('Failed to update OBS:', error);
    } finally {
        obs.disconnect(); // Pastikan koneksi ditutup
    }
}


// Proses command !pelaku
async function handlePelakuCommand(username) {
    const outputPath = `wanted_posters/${username}.png`;

    try {
        // Periksa apakah poster sudah ada
        if (fs.existsSync(outputPath)) {
            console.log(`Poster untuk ${username} sudah ada. Menggunakan file yang sudah ada.`);
        } else {
            // Ambil URL foto profil
            const profileImageUrl = await getUserProfileImage(username);
            // Buat poster baru
            await createWantedPoster(username, profileImageUrl, outputPath);
        }

        // Update gambar di OBS
        await updateObsImage(outputPath);
    } catch (error) {
        console.error(`Error handling pelaku command for ${username}:`, error);
    }
}

// Event ketika bot menerima pesan
client.on('message', async (channel, tags, message, self) => {
    if (self) return; // Abaikan pesan dari bot sendiri

    if (message.startsWith('!pelaku')) {
        const args = message.split(' ');
        let username = args[1]; // Ambil username dari command

        if (username) {
            // Hapus tanda '@' jika ada
            username = username.startsWith('@') ? username.slice(1) : username;

            client.say(channel, `Pelaku yang dicurigai adalah ${username}!`);
            await handlePelakuCommand(username);
        } else {
            client.say(channel, 'Format command salah. Gunakan: !pelaku [username]');
        }
    }
});

// Jalankan Bot Twitch
client.connect();

// Express.js untuk menangani OAuth Redirect
const app = express();
const PORT = 3000;

app.get('/callback', (req, res) => {
    res.send('OAuth Redirect Successful!');
    console.log('OAuth callback hit:', req.query);
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
