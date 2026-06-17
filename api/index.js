const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda'); // Wajib buat Vercel/Cloud

/**
 * --- KONFIGURASI DATA AKUN & CHANNEL ---
 */
const apiId = 31767208; 
const apiHash = "API_HAS MU";
const myUserId = "8651425286"; 
const channelTrxId = "@vanzztrx"; 
const channelLink = "https://t.me/vanzztrx"; 

const sessionString = "sesi_mu";
const stringSession = new StringSession(sessionString); 

// --- FUNGSI OTOMATISASI HOTELMURAH ---
async function getRealQRIS(nominal) {
    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath || '/usr/bin/chromium',
            headless: true,
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 812 });

        // Langkah 1: Ke Web
        await page.goto('https://www.hotelmurah.com/pulsa/top-up-dana', { waitUntil: 'networkidle2' });

        // Langkah 2: Input No HP
        await page.type('input[name="phone_number"]', 'NOMOR_DANA_MU');

        // Langkah 3: Pilih Nominal
        const nominalTarget = `DANA ${parseInt(nominal).toLocaleString('id-ID')}`;
        await page.evaluate((text) => {
            const divs = [...document.querySelectorAll('div')];
            const target = divs.find(d => d.innerText.includes(text));
            if (target) target.click();
        }, nominalTarget);

        await new Promise(r => setTimeout(r, 2000));

        // Langkah 4: Pilih QRIS & Lanjut
        await page.evaluate(() => {
            const qris = [...document.querySelectorAll('div, label')].find(e => e.innerText.includes('QRIS'));
            if (qris) qris.click();
        });
        await page.click('.btn-lanjut');

        // Langkah 5: Tunggu QRIS muncul & Screenshot
        await page.waitForSelector('img[src*="chart"]', { timeout: 15000 });
        const qrArea = await page.$('.qris-content') || await page.$('body');
        const buffer = await qrArea.screenshot({ type: 'jpeg', quality: 80 });

        await browser.close();
        return buffer;
    } catch (e) {
        if (browser) await browser.close();
        throw e;
    }
}

(async () => {
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    console.log("✅ VANZZ Userbot Aktif!");

    client.addEventHandler(async (event) => {
        const message = event.message;
        if (!message || !message.out || !message.message) return;
        const text = message.message;

        // --- 1. FITUR: VANZgetpay <nominal> ---
        if (text.startsWith("VANZgetpay")) {
            const nominal = text.split(" ")[1];
            if (!nominal) return;

            try {
                await client.editMessage(message.peerId, { message: message.id, text: `⏳ **Otomatisasi Hotelmurah: DANA ${nominal}...**` });

                const qrisImg = await getRealQRIS(nominal);

                await client.sendFile(message.peerId, {
                    file: qrisImg,
                    caption: `┏━〔 VANZZ PAYMENT 〕━┓\n┃ Nominal: Rp ${nominal}\n┃ Status : Real Screenshot\n┗━━━━━━━━━━━━━━━━┛`,
                    forceDocument: false
                });
                await client.deleteMessages(message.peerId, [message.id], { revoke: true });
            } catch (err) {
                await client.editMessage(message.peerId, { message: message.id, text: `❌ **Gagal:** ${err.message}` });
            }
        }

        // --- 2. FITUR: VANZverif <item> <harga> ---
        if (text.startsWith("VANZverif")) {
            try {
                const args = text.split(" ");
                if (args.length < 3) {
                    return await client.editMessage(message.peerId, { message: message.id, text: "❌ Format: `VANZverif <item> <harga>`" });
                }

                const harga = args[args.length - 1];
                const item = args.slice(1, -1).join(" ");
                const reply = await message.getReplyMessage();

                if (!reply || !reply.media) {
                    return await client.editMessage(message.peerId, { message: message.id, text: "❌ **Balas (Reply) FOTO bukti transfernya, Vanz!**" });
                }

                // Kirim ke Channel
                await client.sendFile(channelTrxId, {
                    file: reply.media,
                    caption: `🛒 **TRANSAKSI BERHASIL**\n\n📝 **Item:** ${item}\n💰 **Harga:** Rp ${harga}\n📅 **Waktu:** ${new Date().toLocaleString('id-ID')}\n\n✅ **Verified by Vanzz Payment**`,
                });

                await client.editMessage(message.peerId, {
                    message: message.id,
                    text: `✅ **Pembayaran Terverifikasi!**\n🔗 **Cek di sini:** ${channelLink}`,
                });
            } catch (e) {
                console.error(e);
            }
        }
    }, new NewMessage({}));
})();
