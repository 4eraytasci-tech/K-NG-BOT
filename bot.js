require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelType,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

// --- ANTI-CRASH & GLOBAL HATA YAKALAYICI ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [ANTI-CRASH] Yakalanmayan Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ [ANTI-CRASH] Yakalanmayan Exception:', err);
});

// --- TEMEL AYARLAR ---
const TOKEN = process.env.TOKEN;
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'GIZLI_ANAHTARINI_ENV_DOSYASINA_YAZ';
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';
const DEFAULT_GUILD_ID = process.env.GUILD_ID || '1570150711294042153';
const GELISTIRICI_ID = process.env.GELISTIRICI_ID || '1520781174656467154';
const GUNUN_SORUSU_KANAL_ID = process.env.GUNUN_SORUSU_KANAL_ID || '1571212319801745449';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// --- ÇOKLU SUNUCU (MULTI-GUILD) DESTEKLİ KALICI VERİTABANI SİSTEMİ ---
const DB_FILE = './veritabani.json';

const VARSAYILAN_AYARLAR = {
    // 1. Gelişmiş 1.000.000x Moderasyon Kalkanı Ayarları
    otoMod: true,
    linkEngel: false,
    izinliLinkler: ['youtube.com', 'youtu.be', 'tenor.com', 'giphy.com'],
    davetEngel: true,
    spamEngel: true,
    spamMesajLimiti: 5,
    spamSaniye: 5,
    spamCezaDakika: 5,
    tekrarMesajEngel: true,
    capsEngel: true,
    capsYuzde: 70,
    capsMinUzunluk: 8,
    etiketEngel: true,
    maxEtiketSayisi: 4,
    emojiSpamEngel: true,
    maxEmojiSayisi: 8,
    zalgoEngel: true,
    yeniHesapEngel: false,
    yeniHesapMinGun: 3,
    antiRaid: false,
    modLogKanal: '',
    yasakliKelimeler: ['amk', 'aq', 'orospu', 'piç'],

    // 2. Kanal Kısıtlamaları (Çoklu Sunucu Uyumlu)
    oyunKanallari: [],
    kumarhaneKanallari: [],
    komutKanallari: [],

    // 3. Hoş Geldin & Oto-Rol
    hosgeldinKanal: '',
    hosgeldinMesaj: 'Hoş geldin {user}! Seninle birlikte **{memberCount}** kişi olduk!',
    otoRol: '',

    // 4. Gelişmiş Çoklu Rol Ticket Sistemi
    ticketKategori: '',
    ticketYetkiliRoller: [],
    ticketTamYetkiliRoller: [],
    ticketKonular: [
        { id: 'genel', isim: 'Genel Destek', aciklama: 'Sunucu içi genel sorularınız için', emoji: '📩' },
        { id: 'sikayet', isim: 'Üye / Yetkili Şikayeti', aciklama: 'Kural ihlali bildirmek için', emoji: '🚨' }
    ],

    // 5. Ekonomi & Seviye Zorluğu
    gunlukOdul: 250,
    xpZorlukCarpani: 250, // Eski: level * 100 -> Yeni: level * level * 250 (Çok daha dengeli ve zor)
    sesXpAktif: true,
    sesDakikaXp: 15,
    sesDakikaKm: 10
};

function verileriYukle() {
    let parsed = {};
    if (fs.existsSync(DB_FILE)) {
        try {
            parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (e) {
            console.error('Veritabanı okunurken hata oluştu, varsayılan başlatılıyor.');
        }
    }

    return {
        xpData: new Map(parsed.xpData || []),
        kingMoneyData: new Map(parsed.kingMoneyData || []),
        gunlukData: new Map(parsed.gunlukData || []),
        uyarilar: new Map(parsed.uyarilar || []),
        afkData: new Map(parsed.afkData || []),
        zooData: new Map(parsed.zooData || []),
        guildAyarlar: parsed.guildAyarlar || {},
        guildKomutlar: parsed.guildKomutlar || {},
        guildBiletler: parsed.guildBiletler || {},
        guildLogs: parsed.guildLogs || {},
        aktifCekilisler: Array.isArray(parsed.aktifCekilisler) ? parsed.aktifCekilisler : [],
        // Geriye dönük tekil veri uyumluluğu
        legacyAyarlar: parsed.ayarlar || null,
        legacyKomutlar: parsed.ozelKomutlar || null,
        legacyBiletler: parsed.kapatilanBiletler || null,
        legacyLogs: parsed.logs || null
    };
}

const db = verileriYukle();

function getGuildAyarlar(guildId) {
    if (!db.guildAyarlar[guildId]) {
        const temel = db.legacyAyarlar && guildId === DEFAULT_GUILD_ID ? db.legacyAyarlar : {};
        const birlesik = { ...VARSAYILAN_AYARLAR, ...temel };

        // Eski tekil ticket rollerini diziye aktar
        if (temel.ticketYetkiliRol && (!Array.isArray(birlesik.ticketYetkiliRoller) || birlesik.ticketYetkiliRoller.length === 0)) {
            birlesik.ticketYetkiliRoller = [temel.ticketYetkiliRol];
        }
        if (temel.ticketTamYetkiliRol && (!Array.isArray(birlesik.ticketTamYetkiliRoller) || birlesik.ticketTamYetkiliRoller.length === 0)) {
            birlesik.ticketTamYetkiliRoller = [temel.ticketTamYetkiliRol];
        }
        if (!Array.isArray(birlesik.yasakliKelimeler)) birlesik.yasakliKelimeler = [...VARSAYILAN_AYARLAR.yasakliKelimeler];
        if (!Array.isArray(birlesik.ticketKonular) || birlesik.ticketKonular.length === 0) {
            birlesik.ticketKonular = [...VARSAYILAN_AYARLAR.ticketKonular];
        }
        if (!Array.isArray(birlesik.izinliLinkler)) birlesik.izinliLinkler = [...VARSAYILAN_AYARLAR.izinliLinkler];
        if (!Array.isArray(birlesik.oyunKanallari)) birlesik.oyunKanallari = [];
        if (!Array.isArray(birlesik.kumarhaneKanallari)) birlesik.kumarhaneKanallari = [];
        if (!Array.isArray(birlesik.komutKanallari)) birlesik.komutKanallari = [];

        db.guildAyarlar[guildId] = birlesik;
    }
    return db.guildAyarlar[guildId];
}

function getGuildKomutlar(guildId) {
    if (!db.guildKomutlar[guildId]) {
        db.guildKomutlar[guildId] = (db.legacyKomutlar && guildId === DEFAULT_GUILD_ID)
            ? db.legacyKomutlar
            : [{ tetikleyici: '!server', cevap: 'Sunucumuza hoş geldin! Kuralları okumayı unutma.' }];
    }
    return db.guildKomutlar[guildId];
}

function getGuildBiletler(guildId) {
    if (!db.guildBiletler[guildId]) {
        db.guildBiletler[guildId] = (db.legacyBiletler && guildId === DEFAULT_GUILD_ID) ? db.legacyBiletler : [];
    }
    return db.guildBiletler[guildId];
}

function getGuildLogs(guildId) {
    if (!db.guildLogs[guildId]) {
        db.guildLogs[guildId] = (db.legacyLogs && guildId === DEFAULT_GUILD_ID) ? db.legacyLogs : [];
    }
    return db.guildLogs[guildId];
}

function verileriKaydet() {
    const data = {
        xpData: Array.from(db.xpData.entries()),
        kingMoneyData: Array.from(db.kingMoneyData.entries()),
        gunlukData: Array.from(db.gunlukData.entries()),
        uyarilar: Array.from(db.uyarilar.entries()),
        afkData: Array.from(db.afkData.entries()),
        zooData: Array.from(db.zooData.entries()),
        guildAyarlar: db.guildAyarlar,
        guildKomutlar: db.guildKomutlar,
        guildBiletler: db.guildBiletler,
        guildLogs: db.guildLogs,
        aktifCekilisler: db.aktifCekilisler
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function logEkle(guildId, kategori, islem, detay, kullanici = 'Sistem') {
    const logs = getGuildLogs(guildId);
    logs.unshift({
        id: Date.now() + Math.floor(Math.random() * 1000),
        tarih: new Date().toLocaleString('tr-TR'),
        kategori,
        islem,
        detay,
        kullanici
    });
    if (logs.length > 400) logs.pop();
    verileriKaydet();
}

function getBakiye(userId) {
    if (!db.kingMoneyData.has(userId)) db.kingMoneyData.set(userId, 0);
    return db.kingMoneyData.get(userId);
}

function setBakiye(userId, miktar) {
    db.kingMoneyData.set(userId, Math.max(0, Math.floor(miktar)));
}

function bakiyeEkle(userId, miktar) {
    const mevcut = getBakiye(userId);
    setBakiye(userId, mevcut + miktar);
    return getBakiye(userId);
}

function ticketKanaliMi(channel) {
    if (!channel) return false;
    return channel.name?.startsWith('ticket-') || channel.topic?.includes('KINGBOT_TICKET');
}

function gerekenXpHesapla(level, carpan = 250) {
    // Zorlaştırılmış kademeli seviye formülü: Seviye 1 -> 250 XP, Seviye 2 -> 1000 XP, Seviye 3 -> 2250 XP...
    return Math.floor(Math.pow(level, 2) * (Number(carpan) || 250));
}

// --- OTURUM TOKEN GÜVENLİK HARİTASI ---
const aktifOturumlar = new Map(); // token -> { userId, username, avatar, expiresAt }

// --- OYUN VE SİSTEM HAFIZALARI ---
const aktifKelimeOyunlari = new Map(); // channelId -> { kelime, sonYazanId }
const aktifSayiOyunlari = new Map(); // channelId -> { sonrakiSayi, sonYazanId }
const aktifGununSorulari = new Map(); // channelId -> { soru, cevaplar, aktif }

const aktifAnketler = new Map();
const aktifDuellolar = new Map();
const aktifAdamAsmaca = new Map();
const aktifBayrakOyunu = new Map();
const aktifHizliYazi = new Map();
const aktifBlackjack = new Map();
const aktifMine = new Map();
const geciciSesOdalar = new Set();
const owoCooldown = new Map();
const spamTakip = new Map();
const sonMesajTakip = new Map();
const raidTakip = new Map();

// Periyodik RAM Temizleyici (10 dakikadan eski yarım kalan oyunları temizler ve bahisleri iade eder)
setInterval(() => {
    const simdi = Date.now();
    for (const [msgId, oyun] of aktifBlackjack.entries()) {
        if (simdi - (oyun.baslangic || 0) > 600000) {
            bakiyeEkle(oyun.userId, oyun.miktar);
            aktifBlackjack.delete(msgId);
        }
    }
    for (const [msgId, oyun] of aktifMine.entries()) {
        if (simdi - (oyun.baslangic || 0) > 600000) {
            bakiyeEkle(oyun.userId, oyun.miktar);
            aktifMine.delete(msgId);
        }
    }
    for (const [msgId, d] of aktifDuellolar.entries()) {
        if (simdi - (d.baslangic || 0) > 300000) aktifDuellolar.delete(msgId);
    }
    verileriKaydet();
}, 300000);

// --- OWO HAYVAN HAVUZU ---
const hayvanHavuzu = [
    { ad: 'Tavşan', emoji: '🐇', nadirlik: 'Yaygın', deger: 15, sans: 40 },
    { ad: 'Tilki', emoji: '🦊', nadirlik: 'Yaygın', deger: 20, sans: 30 },
    { ad: 'Kurt', emoji: '🐺', nadirlik: 'Nadir', deger: 45, sans: 15 },
    { ad: 'Kartal', emoji: '🦅', nadirlik: 'Nadir', deger: 60, sans: 10 },
    { ad: 'Ejderha', emoji: '🐉', nadirlik: 'Destansı', deger: 150, sans: 4 },
    { ad: 'Anka Kuşu', emoji: '🔥', nadirlik: 'Efsanevi', deger: 350, sans: 1 }
];

function rastgeleHayvanSec() {
    const toplamSans = hayvanHavuzu.reduce((acc, h) => acc + h.sans, 0);
    let rastgele = Math.random() * toplamSans;
    for (const hayvan of hayvanHavuzu) {
        if (rastgele < hayvan.sans) return hayvan;
        rastgele -= hayvan.sans;
    }
    return hayvanHavuzu[0];
}

// --- BLACKJACK YARDIMCI FONKSİYONLARI ---
function kartCek() {
    const semboller = ['♠️', '♥️', '♦️', '♣️'];
    const degerler = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const sembol = semboller[Math.floor(Math.random() * semboller.length)];
    const deger = degerler[Math.floor(Math.random() * degerler.length)];
    let sayisal = 0;
    if (['J', 'Q', 'K'].includes(deger)) sayisal = 10;
    else if (deger === 'A') sayisal = 11;
    else sayisal = parseInt(deger);
    return { isim: `${deger}${sembol}`, deger: sayisal };
}

function elPuaniHesapla(el) {
    let toplam = el.reduce((acc, k) => acc + k.deger, 0);
    let asSayisi = el.filter(k => k.deger === 11).length;
    while (toplam > 21 && asSayisi > 0) {
        toplam -= 10;
        asSayisi--;
    }
    return toplam;
}

// --- TDK SÖZLÜĞÜ HAFIZAYA YÜKLEME ---
const kelimeSeti = new Set();
const adamAsmacaHavuzu = [];
if (fs.existsSync('./kelimeler.txt')) {
    const dosyaIcerigi = fs.readFileSync('./kelimeler.txt', 'utf8');
    dosyaIcerigi.split(/\r?\n/).forEach(k => {
        const temizKelime = k.toLowerCase().trim();
        if (temizKelime) {
            kelimeSeti.add(temizKelime);
            if (temizKelime.length >= 4 && temizKelime.length <= 8 && /^[a-zçğıöşü]+$/.test(temizKelime)) {
                adamAsmacaHavuzu.push(temizKelime);
            }
        }
    });
    console.log(`📚 kelimeler.txt dosyasından ${kelimeSeti.size} kelime yüklendi.`);
}

// --- OYUN HAVUZLARI ---
const gununSorulari = [
    { soru: "Türkiye'nin başkenti neresidir?", cevaplar: ["ankara"] },
    { soru: "Dünyaya en yakın gezegen hangisidir?", cevaplar: ["venüs", "venus"] },
    { soru: "İstanbul hangi yılda fethedilmiştir?", cevaplar: ["1453"] },
    { soru: "1 kilogram kaç gramdır?", cevaplar: ["1000", "bir bin"] },
    { soru: "Su hangi sıcaklıkta kaynar?", cevaplar: ["100", "100 derece", "100c", "100°c", "yüz"] }
];

const bayrakHavuzu = [
    { bayrak: "🇹🇷", cevaplar: ["türkiye", "turkiye"] },
    { bayrak: "🇦🇿", cevaplar: ["azerbaycan"] },
    { bayrak: "🇯🇵", cevaplar: ["japonya"] },
    { bayrak: "🇩🇪", cevaplar: ["almanya"] },
    { bayrak: "🇧🇷", cevaplar: ["brezilya"] },
    { bayrak: "🇮🇹", cevaplar: ["italya"] },
    { bayrak: "🇫🇷", cevaplar: ["fransa"] },
    { bayrak: "🇪🇸", cevaplar: ["ispanya"] },
    { bayrak: "🇰🇷", cevaplar: ["güney kore", "guney kore", "kore"] },
    { bayrak: "🇨🇦", cevaplar: ["kanada"] },
    { bayrak: "🇦🇷", cevaplar: ["arjantin"] },
    { bayrak: "🇬🇧", cevaplar: ["ingiltere", "birleşik krallık", "birlesik krallik"] }
];

const hizliYaziCumleleri = [
    "Hızlı yazan kazanır ama dikkatli olan hata yapmaz.",
    "Kod yazmak sabır ve dikkat gerektiren keyifli bir sanattır.",
    "Gece gökyüzündeki yıldızlar binlerce yıl öncesinden ışık taşır.",
    "Başarı tesadüf değil, düzenli çalışmanın doğal sonucudur.",
    "Bugünün işini yarına bırakmayanlar her zaman bir adım öndedir."
];

const dogrulukSorulari = [
    "Şimdiye kadar oynadığın ve asla sıkılmadığın oyun hangisi?",
    "Hayatında yaptığın en komik sakarlık neydi?",
    "Bir süper gücün olsaydı hangisini seçerdin?",
    "Şu ana kadar izlediğin en iyi film veya dizi hangisi?",
    "Issız bir adaya düşsen yanına alacağın 3 şey ne olurdu?"
];

const cesaretGorevleri = [
    "Sohbete en sevdiğin şarkının bir dizesini yaz!",
    "Profil fotoğrafını 10 dakikalığına komik bir şey yap!",
    "Sohbetteki son kişiye güzel bir iltifat et!",
    "Bir sonraki mesajını sadece emojilerle anlat!",
    "Ses kanalındaysan 10 saniye boyunca robot gibi konuş!"
];

// --- DOSYADAN YASAKLI KELİME HAVUZU ---
const dosyaYasakliKelimeler = new Set();
if (fs.existsSync('./kufurler.txt')) {
    const dosyaIcerigi = fs.readFileSync('./kufurler.txt', 'utf8');
    dosyaIcerigi.split(/\r?\n/).forEach(k => {
        const temiz = k.toLocaleLowerCase('tr-TR').trim();
        if (temiz) dosyaYasakliKelimeler.add(temiz);
    });
    console.log(`🛡️ kufurler.txt dosyasından ${dosyaYasakliKelimeler.size} yasaklı kelime yüklendi.`);
}

// --- YARDIMCI FONKSİYONLAR ---
async function modLogGonder(guild, embed) {
    if (!guild) return;
    const ayar = getGuildAyarlar(guild.id);
    const logKanal = ayar.modLogKanal
        ? guild.channels.cache.get(ayar.modLogKanal)
        : guild.channels.cache.find(ch => ch.name.toLowerCase().includes('mod-log'));
    if (logKanal) {
        await logKanal.send({ embeds: [embed] }).catch(() => {});
    }
}

async function xpEkle(guild, member, channel, miktar) {
    if (!guild || !member) return;
    const ayar = getGuildAyarlar(guild.id);
    let userXp = db.xpData.get(member.id) || { xp: 0, level: 1 };
    userXp.xp += miktar;
    let gerekenXp = gerekenXpHesapla(userXp.level, ayar.xpZorlukCarpani);

    if (userXp.xp >= gerekenXp) {
        userXp.level += 1;
        if (channel) {
            channel.send(`🎉 Tebrikler ${member}, zorlu seviyeleri aşarak **Level ${userXp.level}** oldun! 🚀`).catch(() => {});
        }

        const rolAdi = `Seviye ${userXp.level}`;
        let rol = guild.roles.cache.find(r => r.name === rolAdi);

        if (!rol) {
            let renk = '#95a5a6';
            if (userXp.level >= 3) renk = '#3498db';
            if (userXp.level >= 5) renk = '#9b59b6';
            if (userXp.level >= 10) renk = '#e74c3c';
            if (userXp.level >= 15) renk = '#f1c40f';
            if (userXp.level >= 20) renk = '#e67e22';
            if (userXp.level >= 30) renk = '#1abc9c';
            if (userXp.level >= 50) renk = '#00ffff';

            try {
                rol = await guild.roles.create({
                    name: rolAdi,
                    color: renk,
                    reason: 'Otomatik seviye rolü ve renk sistemi'
                });
            } catch {}
        }

        if (rol) {
            const eskiRoller = member.roles.cache.filter(r => r.name.startsWith('Seviye '));
            if (eskiRoller.size > 0) await member.roles.remove(eskiRoller).catch(() => {});
            await member.roles.add(rol).catch(() => {});
        }
    }

    db.xpData.set(member.id, userXp);
    verileriKaydet();
}

// --- KALICI ÇEKİLİŞ TAMAMLAMA FONKSİYONU ---
function cekilisiZamanla(cekilis) {
    const kalanSure = Math.max(1000, cekilis.bitisZamani - Date.now());
    setTimeout(async () => {
        try {
            const kanal = await client.channels.fetch(cekilis.kanalId).catch(() => null);
            if (kanal) {
                const fetchedMsg = await kanal.messages.fetch(cekilis.mesajId).catch(() => null);
                if (fetchedMsg) {
                    const users = await fetchedMsg.reactions.cache.get('✅')?.users.fetch();
                    const katilanlar = users?.filter(u => !u.bot);
                    if (!katilanlar || katilanlar.size === 0) {
                        await kanal.send(`😢 **${cekilis.odul}** çekilişine kimse katılmadı.`);
                    } else {
                        await kanal.send(`🏆 Tebrikler ${katilanlar.random()}! **${cekilis.odul}** çekilişini kazandın!`);
                    }
                }
            }
        } finally {
            db.aktifCekilisler = db.aktifCekilisler.filter(c => c.mesajId !== cekilis.mesajId);
            verileriKaydet();
        }
    }, kalanSure);
}

// --- TÜM SLASH KOMUTLARI (GLOBAL YÜKLEME - TÜM SUNUCULARDA ÇALIŞIR) ---
const commands = [
    new SlashCommandBuilder().setName('yardim').setDescription('Botun tüm komutlarını ve kategorilerini listeler.'),
    new SlashCommandBuilder().setName('ping').setDescription('Botun gecikme (ms) süresini gösterir.'),
    new SlashCommandBuilder().setName('avatar').setDescription('Kullanıcının profil fotoğrafını gösterir.').addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(false)),
    new SlashCommandBuilder().setName('sunucu-bilgi').setDescription('Sunucu istatistiklerini gösterir.'),
    new SlashCommandBuilder().setName('profil').setDescription('Seviye, XP, KingMoney ve uyarı kartını gösterir.').addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(false)),

    new SlashCommandBuilder().setName('sil').setDescription('Belirtilen miktarda mesajı siler.').addIntegerOption(o => o.setName('sayi').setDescription('Mesaj sayısı (1-100)').setRequired(true)),
    new SlashCommandBuilder().setName('at').setDescription('Üyeyi sunucudan atar.').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('yasakla').setDescription('Üyeyi sunucudan yasaklar.').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('unban').setDescription('ID ile yasak kaldırır.').addStringOption(o => o.setName('id').setDescription('Kullanıcı ID').setRequired(true)),
    new SlashCommandBuilder().setName('sustur').setDescription('Üyeyi geçici susturur.').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)).addIntegerOption(o => o.setName('dakika').setDescription('Süre (Dakika)').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('kilitle').setDescription('Kanalı mesaj yazmaya kapatır.'),
    new SlashCommandBuilder().setName('ac').setDescription('Kilitli kanalı açar.'),
    new SlashCommandBuilder().setName('rol-ver').setDescription('Üyeye rol verir.').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)).addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('rol-al').setDescription('Üyeden rol alır.').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)).addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('yavasmod').setDescription('Kanal yavaş modunu ayarlar.').addIntegerOption(o => o.setName('saniye').setDescription('Saniye (0 kapatır)').setRequired(true)),
    new SlashCommandBuilder().setName('uyar').setDescription('Üyeye uyarı verir (3 uyarıda otomatik susturulur).').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi').setRequired(true)),
    new SlashCommandBuilder().setName('uyarilar').setDescription('Üyenin geçmiş uyarılarını listeler.').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)),
    new SlashCommandBuilder().setName('uyari-sil').setDescription('Üyenin tüm uyarılarını sıfırlar.').addUserOption(o => o.setName('kullanici').setDescription('Üye').setRequired(true)),
    new SlashCommandBuilder().setName('oto-mod').setDescription('Link ve yasaklı kelime korumasını açıp kapatır.').addStringOption(o => o.setName('durum').setDescription('Açık veya Kapalı').setRequired(true).addChoices({ name: 'Açık', value: 'acik' }, { name: 'Kapalı', value: 'kapali' })),
    new SlashCommandBuilder().setName('ticket-ekle').setDescription('Aktif destek talebine bir üyeyi dahil eder.').addUserOption(o => o.setName('kullanici').setDescription('Eklenecek üye').setRequired(true)),
    new SlashCommandBuilder().setName('ticket-cikar').setDescription('Aktif destek talebinden bir üyeyi çıkarır.').addUserOption(o => o.setName('kullanici').setDescription('Çıkarılacak üye').setRequired(true)),

    new SlashCommandBuilder().setName('gunluk').setDescription('24 saatte bir günlük KingMoney ödülünü alırsın.'),
    new SlashCommandBuilder().setName('seviye').setDescription('Seviye, XP ve KingMoney bilgini gösterir.').addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(false)),
    new SlashCommandBuilder().setName('siralama').setDescription('Sunucunun en zengin KingMoney ilk 10 üyesini gösterir.'),
    new SlashCommandBuilder().setName('market').setDescription('KingMoney ile satın alabileceğin özel ödülleri listeler.'),
    new SlashCommandBuilder().setName('satin-al')
        .setDescription('Marketten KingMoney harcayarak ürün satın alırsın.')
        .addStringOption(o => o.setName('urun').setDescription('Alınacak ürün').setRequired(true).addChoices(
            { name: '💎 VIP Üye Rolü (500 KingMoney)', value: 'vip' },
            { name: '👑 Sunucu Şampiyonu Rolü (1500 KingMoney)', value: 'sampiyon' },
            { name: '✏️ Özel Takma Ad Değişimi (250 KingMoney)', value: 'takma-ad' }
        ))
        .addStringOption(o => o.setName('yeni-isim').setDescription('Takma ad seçtiysen yeni ismin').setRequired(false)),
    new SlashCommandBuilder().setName('gonder').setDescription('Başka bir üyeye KingMoney gönderirsin.').addUserOption(o => o.setName('kullanici').setDescription('Alıcı').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('KingMoney miktarı').setRequired(true)),
    new SlashCommandBuilder().setName('duello').setDescription('Bir üyeye KingMoney ortaya koyarak yazı-tura düellosu teklif edersin.').addUserOption(o => o.setName('rakip').setDescription('Düello rakibi').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Bahis KingMoney miktarı').setRequired(true)),

    new SlashCommandBuilder().setName('zar').setDescription('1-6 arası zar atar.'),
    new SlashCommandBuilder().setName('yazi-tura').setDescription('Yazı tura atar.'),
    new SlashCommandBuilder().setName('espri').setDescription('Rastgele soğuk espri yapar.'),
    new SlashCommandBuilder().setName('kelime-oyunu-baslat').setDescription('TDK sözlüklü kelime türetmece oyununu başlatır.').addStringOption(o => o.setName('ilk-kelime').setDescription('Başlangıç kelimesi').setRequired(true)),
    new SlashCommandBuilder().setName('sayi-oyunu-baslat').setDescription('Sayı saymaca oyununu başlatır.'),
    new SlashCommandBuilder().setName('adam-asmaca').setDescription('Kanalda Adam Asmaca oyunu başlatır.'),
    new SlashCommandBuilder().setName('bayrak-oyunu').setDescription('Bayrak tahmin yarışması başlatır.'),
    new SlashCommandBuilder().setName('hizli-yazi').setDescription('Hızlı yazma yarışması başlatır.'),
    new SlashCommandBuilder().setName('dc').setDescription('Butonlu Doğruluk mu Cesaretlik mi oyunu başlatır.'),
    new SlashCommandBuilder().setName('gunun-sorusu').setDescription('Manuel günün bilgi sorusunu başlatır.'),

    new SlashCommandBuilder().setName('itiraf').setDescription('İsmin gizli kalarak anonim itiraf gönderirsin.').addStringOption(o => o.setName('mesaj').setDescription('İtiraf metni').setRequired(true)),
    new SlashCommandBuilder().setName('oneri').setDescription('Sunucu için oylamalı öneri gönderirsin.').addStringOption(o => o.setName('mesaj').setDescription('Öneri metni').setRequired(true)),
    new SlashCommandBuilder().setName('afk').setDescription('Seni AFK moduna alır, etiketlendiğinde bilgi verir.').addStringOption(o => o.setName('sebep').setDescription('AFK sebebi').setRequired(false)),
    new SlashCommandBuilder().setName('hatirlat').setDescription('Belirtilen dakika sonra sana hatırlatma yapar.').addIntegerOption(o => o.setName('dakika').setDescription('Kaç dakika sonra?').setRequired(true)).addStringOption(o => o.setName('mesaj').setDescription('Hatırlatma notu').setRequired(true)),
    new SlashCommandBuilder().setName('cekilis').setDescription('Sunucuda çekiliş başlatır.').addStringOption(o => o.setName('odul').setDescription('Ödül').setRequired(true)).addIntegerOption(o => o.setName('sure').setDescription('Süre (Dakika)').setRequired(true)),
    new SlashCommandBuilder().setName('duyuru').setDescription('Embed duyuru yayınlar.').addStringOption(o => o.setName('mesaj').setDescription('Duyuru metni').setRequired(true)),
    new SlashCommandBuilder().setName('anket')
        .setDescription('Butonlu 2 seçenekli interaktif anket başlatır.')
        .addStringOption(o => o.setName('soru').setDescription('Anket sorusu').setRequired(true))
        .addStringOption(o => o.setName('secenek1').setDescription('1. Seçenek').setRequired(true))
        .addStringOption(o => o.setName('secenek2').setDescription('2. Seçenek').setRequired(true))
].map(c => c.toJSON());

// --- OTOMATİK RASTGELE GÜNÜN SORUSU ZAMANLAYICISI ---
function gununSorusunuZamanla() {
    const simdi = new Date();
    const hedefZaman = new Date();
    const rastgeleSaat = Math.floor(Math.random() * (22 - 10 + 1)) + 10;
    const rastgeleDakika = Math.floor(Math.random() * 60);

    hedefZaman.setHours(rastgeleSaat, rastgeleDakika, 0, 0);
    if (hedefZaman <= simdi) hedefZaman.setDate(hedefZaman.getDate() + 1);

    setTimeout(async () => {
        const kanal = client.channels.cache.get(GUNUN_SORUSU_KANAL_ID);
        if (kanal) {
            const secilen = gununSorulari[Math.floor(Math.random() * gununSorulari.length)];
            aktifGununSorulari.set(kanal.id, { soru: secilen.soru, cevaplar: secilen.cevaplar, aktif: true });

            const soruEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('💡 GÜNÜN BİLGİ SORUSU (OTOMATİK)!')
                .setDescription(`> **${secilen.soru}**\n\n🎯 *Doğru cevabı ilk yazan **"Günün Bilgini"** rolünü, **+150 XP** ve **+150 KingMoney** ödülünü kazanır!*`)
                .setTimestamp();

            await kanal.send({ embeds: [soruEmbed] }).catch(() => {});
        }
        gununSorusunuZamanla();
    }, hedefZaman.getTime() - simdi.getTime());
}

// --- SES KANALI XP VE KINGMONEY DÖNGÜSÜ (HER 1 DAKİKADA BİR) ---
setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
        const ayar = getGuildAyarlar(guild.id);
        if (!ayar.sesXpAktif) continue;

        guild.voiceStates.cache.forEach(vs => {
            if (!vs.channelId || !vs.member || vs.member.user.bot) return;
            if (vs.selfMute || vs.selfDeaf || vs.serverMute || vs.serverDeaf) return;
            if (vs.channel && vs.channel.members.filter(m => !m.user.bot).size < 2) return; // Tek başına AFK kasmayı engeller

            xpEkle(guild, vs.member, null, Number(ayar.sesDakikaXp) || 15);
            bakiyeEkle(vs.member.id, Number(ayar.sesDakikaKm) || 10);
        });
    }
    verileriKaydet();
}, 60000);

// --- OTOMATİK VERİTABANI YEDEKLEME (HER 12 SAATTE BİR) ---
setInterval(async () => {
    if (!fs.existsSync(DB_FILE)) return;
    try {
        const gelistirici = await client.users.fetch(GELISTIRICI_ID).catch(() => null);
        if (gelistirici) {
            await gelistirici.send({
                content: `💾 **Otomatik Veritabanı Yedeği** (${new Date().toLocaleString('tr-TR')})`,
                files: [DB_FILE]
            }).catch(() => {});
        }
    } catch {}
}, 12 * 60 * 60 * 1000);

client.once('clientReady', async () => {
    console.log(`🚀 ${client.user.tag} aktif! Tüm sistemler ve 1.000.000x Moderasyon Kalkanı devrede.`);
    gununSorusunuZamanla();

    // Yarım kalan çekilişleri yeniden zamanla
    db.aktifCekilisler.forEach(c => cekilisiZamanla(c));

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        // Global komut kaydı: Botun eklendiği TÜM sunucularda slash komutları otomatik aktif olur
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Tüm slash komutları global olarak tüm sunuculara yüklendi!');
    } catch (error) {
        console.error('Komut yükleme hatası:', error);
    }
});

// --- GEÇİCİ ÖZEL SES ODALARI (JOIN-TO-CREATE) ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.channel && newState.channel.name.toLowerCase().includes('oda oluştur')) {
        try {
            if (!newState.member?.voice?.channelId) return;
            const yeniOda = await newState.guild.channels.create({
                name: `🔊 ${newState.member.displayName} Odası`,
                type: ChannelType.GuildVoice,
                parent: newState.channel.parentId
            });
            geciciSesOdalar.add(yeniOda.id);
            if (newState.member?.voice?.channelId) {
                await newState.member.voice.setChannel(yeniOda).catch(() => {});
            } else {
                geciciSesOdalar.delete(yeniOda.id);
                await yeniOda.delete().catch(() => {});
            }
        } catch (error) {
            console.error('Geçici oda oluşturma hatası:', error);
        }
    }

    if (oldState.channel && geciciSesOdalar.has(oldState.channel.id)) {
        if (oldState.channel.members.size === 0) {
            geciciSesOdalar.delete(oldState.channel.id);
            await oldState.channel.delete().catch(() => {});
        }
    }
});

// --- ÜYE GİRİŞ / ÇIKIŞ, ANTI-RAID VE YENİ HESAP KORUMASI ---
client.on('guildMemberAdd', async member => {
    const guildId = member.guild.id;
    const ayar = getGuildAyarlar(guildId);
    logEkle(guildId, 'UYE', 'Sunucuya Katıldı', `Hesap ID: ${member.id}`, member.user.tag);

    // 1. Anti-Raid Koruması (10 saniyede 6+ hesap girerse otomatik atar)
    if (ayar.antiRaid) {
        const simdi = Date.now();
        const girisler = (raidTakip.get(guildId) || []).filter(t => simdi - t < 10000);
        girisler.push(simdi);
        raidTakip.set(guildId, girisler);
        if (girisler.length >= 6) {
            await member.kick('Anti-Raid Koruması: Toplu saldırı şüphesi').catch(() => {});
            logEkle(guildId, 'MODERASYON', '🛡️ Anti-Raid Engeli', `${member.user.tag} baskın koruması nedeniyle atıldı`, 'Oto-Mod');
            return;
        }
    }

    // 2. Yeni Hesap (Fake/Alt Hesap) Koruması
    if (ayar.yeniHesapEngel) {
        const hesapYasiGun = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        const minGun = Number(ayar.yeniHesapMinGun) || 3;
        if (hesapYasiGun < minGun) {
            await member.send(`⚠️ **${member.guild.name}** sunucusuna katılabilmek için Discord hesabının en az **${minGun} günlük** olması gerekiyor.`).catch(() => {});
            await member.kick(`Yeni hesap koruması (${hesapYasiGun.toFixed(1)} günlük)`).catch(() => {});
            logEkle(guildId, 'MODERASYON', '🕵️ Yeni Hesap Engellendi', `${member.user.tag} (${hesapYasiGun.toFixed(1)} günlük hesap) atıldı`, 'Oto-Mod');
            return;
        }
    }

    // 3. Oto-Rol
    let otomatikRol = ayar.otoRol
        ? member.guild.roles.cache.get(ayar.otoRol)
        : member.guild.roles.cache.find(r => ['üye', 'member', 'üyeler'].includes(r.name.toLowerCase()));

    if (otomatikRol) {
        await member.roles.add(otomatikRol).catch(() => {});
    }

    // 4. Hoş Geldin Mesajı
    const kanal = ayar.hosgeldinKanal
        ? member.guild.channels.cache.get(ayar.hosgeldinKanal)
        : member.guild.channels.cache.find(ch => ch.name.toLowerCase().includes('hos-geldiniz') || ch.name.toLowerCase().includes('genel'));

    if (kanal) {
        const metin = (ayar.hosgeldinMesaj || 'Hoş geldin {user}!')
            .replace(/{user}/g, `${member}`)
            .replace(/{server}/g, member.guild.name)
            .replace(/{memberCount}/g, member.guild.memberCount);
        kanal.send({ content: metin }).catch(() => {});
    }

    modLogGonder(member.guild, new EmbedBuilder().setColor('#2ecc71').setTitle('📥 Üye Katıldı').setDescription(`${member} (\`${member.id}\`) sunucuya katıldı.`).setTimestamp());
});

client.on('guildMemberRemove', member => {
    const guildId = member.guild.id;
    const ayar = getGuildAyarlar(guildId);
    logEkle(guildId, 'UYE', 'Sunucudan Ayrıldı', `Hesap ID: ${member.id}`, member.user.tag);

    const kanal = ayar.hosgeldinKanal
        ? member.guild.channels.cache.get(ayar.hosgeldinKanal)
        : member.guild.channels.cache.find(ch => ch.name.toLowerCase().includes('hos-geldiniz') || ch.name.toLowerCase().includes('genel'));

    if (kanal) kanal.send(`👋 **${member.user.tag}** sunucudan ayrıldı. Yolun açık olsun!`).catch(() => {});

    modLogGonder(member.guild, new EmbedBuilder().setColor('#e74c3c').setTitle('📤 Üye Ayrıldı').setDescription(`**${member.user.tag}** (\`${member.id}\`) sunucudan ayrıldı.`).setTimestamp());
});

client.on('messageDelete', message => {
    if (!message.guild || message.author?.bot || ticketKanaliMi(message.channel)) return;

    logEkle(message.guild.id, 'MODERASYON', 'Mesaj Silindi', `#${message.channel.name} kanalında: "${message.content || '[Görsel/Embed]'}"`, message.author.tag);

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗑️ Mesaj Silindi')
        .addFields(
            { name: 'Kullanıcı', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
            { name: 'Kanal', value: `${message.channel}`, inline: true },
            { name: 'İçerik', value: message.content || '*Görsel veya Embed*' }
        )
        .setTimestamp();
    modLogGonder(message.guild, embed);
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.guild || oldMessage.author?.bot || oldMessage.content === newMessage.content || ticketKanaliMi(newMessage.channel)) return;

    logEkle(oldMessage.guild.id, 'MODERASYON', 'Mesaj Düzenlendi', `#${newMessage.channel.name}: "${oldMessage.content}" ➔ "${newMessage.content}"`, oldMessage.author.tag);

    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('✏️ Mesaj Düzenlendi')
        .addFields(
            { name: 'Kullanıcı', value: `${oldMessage.author}`, inline: true },
            { name: 'Kanal', value: `${oldMessage.channel}`, inline: true },
            { name: 'Eski Mesaj', value: oldMessage.content || '*Boş*' },
            { name: 'Yeni Mesaj', value: newMessage.content || '*Boş*' }
        )
        .setTimestamp();
    modLogGonder(oldMessage.guild, embed);
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    const eklenenRoller = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const alinanRoller = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (eklenenRoller.size > 0) {
        modLogGonder(newMember.guild, new EmbedBuilder().setColor('#3498db').setTitle('🏷️ Rol Verildi').setDescription(`${newMember} üyesine **${eklenenRoller.map(r => r.name).join(', ')}** rolü verildi.`).setTimestamp());
    }
    if (alinanRoller.size > 0) {
        modLogGonder(newMember.guild, new EmbedBuilder().setColor('#95a5a6').setTitle('🏷️ Rol Alındı').setDescription(`${newMember} üyesinden **${alinanRoller.map(r => r.name).join(', ')}** rolü alındı.`).setTimestamp());
    }
});

// --- 1.000.000x GELİŞMİŞ OTO-MODERASYON MOTORU ---
async function gelismisModerasyonKontrol(message, ayar) {
    if (!message.member || message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return false;

    const guildId = message.guild.id;
    const icerikTrim = message.content.trim();
    const icerikKucuk = icerikTrim.toLocaleLowerCase('tr-TR');

    const uyarVeSil = async (uyariMetni, logBaslik, logDetay) => {
        await message.delete().catch(() => {});
        logEkle(guildId, 'MODERASYON', logBaslik, logDetay, message.author.tag);
        const msg = await message.channel.send(uyariMetni).catch(() => null);
        if (msg) setTimeout(() => msg.delete().catch(() => {}), 4500);
        return true;
    };

    // 1. Küfür & Argo Koruması (Leetspeak / Sembol Gizleme Dahil)
    if (ayar.otoMod) {
        const tumYasaklilar = new Set([
            ...dosyaYasakliKelimeler,
            ...(ayar.yasakliKelimeler || []).map(k => k.toLocaleLowerCase('tr-TR'))
        ]);
        const temizMetin = icerikKucuk
            .replace(/[@4]/g, 'a')
            .replace(/[3]/g, 'e')
            .replace(/[1!|]/g, 'i')
            .replace(/[0]/g, 'o')
            .replace(/[$5]/g, 's')
            .replace(/[.,!?;:*_'"()-]/g, ' ');
        const kelimeler = temizMetin.split(/\s+/).filter(Boolean);

        if (kelimeler.some(kelime => tumYasaklilar.has(kelime))) {
            return uyarVeSil(
                `🚫 ${message.author}, bu sunucuda küfür veya yasaklı kelime kullanamazsın!`,
                'Küfür / Yasaklı Kelime Engellendi',
                `#${message.channel.name}: "${message.content}"`
            );
        }
    }

    // 2. Discord Davet Linki Engeli
    if (ayar.davetEngel) {
        if (/(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i.test(icerikKucuk)) {
            return uyarVeSil(
                `🛡️ ${message.author}, bu sunucuda Discord davet linki paylaşmak yasaktır!`,
                'Discord Davet Linki Engellendi',
                `#${message.channel.name}: "${message.content}"`
            );
        }
    }

    // 3. Genel URL / Reklam Linki Engeli (İzinli domainler hariç)
    if (ayar.linkEngel) {
        const urlMatch = icerikKucuk.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi);
        if (urlMatch) {
            const izinliListesi = (ayar.izinliLinkler || []).map(d => d.toLowerCase().trim()).filter(Boolean);
            const yasakliLinkVar = urlMatch.some(url => !izinliListesi.some(domain => url.includes(domain)));
            if (yasakliLinkVar) {
                return uyarVeSil(
                    `🔗 ${message.author}, bu kanalda izinsiz bağlantı paylaşımı kapalıdır!`,
                    'İzinsiz URL / Reklam Engellendi',
                    `#${message.channel.name}: "${message.content}"`
                );
            }
        }
    }

    // 4. Dinamik Büyük Harf (Caps Lock) Oranı Koruması (Örn: %70 üzeri ve en az 8 karakter)
    if (ayar.capsEngel) {
        const minUzunluk = Number(ayar.capsMinUzunluk) || 8;
        const esikYuzde = Number(ayar.capsYuzde) || 70;
        const sadeceHarfler = icerikTrim.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');

        if (sadeceHarfler.length >= minUzunluk) {
            const buyukHarfler = sadeceHarfler.replace(/[^A-ZÇĞİÖŞÜ]/g, '').length;
            const oran = Math.round((buyukHarfler / sadeceHarfler.length) * 100);
            if (oran >= esikYuzde) {
                return uyarVeSil(
                    `⚠️ ${message.author}, mesajının **%${oran}** kadarı büyük harf! (Sınır: %${esikYuzde}) Lütfen Caps Lock kapat.`,
                    `Caps Lock Engellendi (%${oran})`,
                    `#${message.channel.name} (Eşik %${esikYuzde}): "${message.content}"`
                );
            }
        }
    }

    // 5. Toplu Etiket (@everyone, @here ve Çoklu Üye/Rol Etiketi) Koruması
    if (ayar.etiketEngel) {
        const toplamEtiket = message.mentions.users.size + message.mentions.roles.size;
        const maxEtiket = Number(ayar.maxEtiketSayisi) || 4;
        if (icerikKucuk.includes('@everyone') || icerikKucuk.includes('@here') || toplamEtiket > maxEtiket) {
            return uyarVeSil(
                `🚫 ${message.author}, toplu etiket veya tek mesajda **${maxEtiket}** adetten fazla etiket kullanamazsın!`,
                'Toplu Etiket Engellendi',
                `#${message.channel.name} (${toplamEtiket} etiket)`
            );
        }
    }

    // 6. Emoji Spam Koruması
    if (ayar.emojiSpamEngel) {
        const maxEmoji = Number(ayar.maxEmojiSayisi) || 8;
        const unicodeEmojiler = icerikTrim.match(/\p{Extended_Pictographic}/gu) || [];
        const discordEmojiler = icerikTrim.match(/<a?:[a-zA-Z0-9_]+:\d+>/g) || [];
        const toplamEmoji = unicodeEmojiler.length + discordEmojiler.length;
        if (toplamEmoji > maxEmoji) {
            return uyarVeSil(
                `😵 ${message.author}, tek mesajda en fazla **${maxEmoji} emoji** kullanabilirsin! (Senin: ${toplamEmoji})`,
                'Emoji Spam Engellendi',
                `#${message.channel.name} (${toplamEmoji} emoji)`
            );
        }
    }

    // 7. Zalgo / Bozuk Glif Karakter Koruması
    if (ayar.zalgoEngel) {
        const zalgoSayisi = (icerikTrim.match(/[\u0300-\u036f\u0489]/g) || []).length;
        if (zalgoSayisi >= 5) {
            return uyarVeSil(
                `👾 ${message.author}, sohbet düzenini bozan Zalgo/bozuk karakterler yasaktır!`,
                'Zalgo Karakter Engellendi',
                `#${message.channel.name}`
            );
        }
    }

    // 8. Tekrarlayan Mesaj (Flood / Copy-Paste) Koruması
    if (ayar.tekrarMesajEngel && icerikKucuk.length >= 4) {
        const onceki = sonMesajTakip.get(message.author.id);
        const simdi = Date.now();
        if (onceki && onceki.icerik === icerikKucuk && simdi - onceki.zaman < 15000) {
            return uyarVeSil(
                `🔁 ${message.author}, aynı mesajı art arda tekrarlama!`,
                'Tekrarlayan Mesaj (Flood) Engellendi',
                `#${message.channel.name}: "${message.content}"`
            );
        }
        sonMesajTakip.set(message.author.id, { icerik: icerikKucuk, zaman: simdi });
    }

    // 9. Özelleştirilebilir Anti-Spam & Otomatik Timeout Koruması
    if (ayar.spamEngel) {
        const simdi = Date.now();
        const limitMesaj = Number(ayar.spamMesajLimiti) || 5;
        const surePenceresi = (Number(ayar.spamSaniye) || 5) * 1000;
        const cezaDk = Number(ayar.spamCezaDakika) || 5;

        const gecmis = (spamTakip.get(message.author.id) || []).filter(t => simdi - t < surePenceresi);
        gecmis.push(simdi);
        spamTakip.set(message.author.id, gecmis);

        if (gecmis.length >= limitMesaj) {
            spamTakip.delete(message.author.id);
            await message.member.timeout(cezaDk * 60 * 1000, 'Oto-Mod: Anti-Spam Koruması').catch(() => {});
            logEkle(guildId, 'MODERASYON', `Anti-Spam Susturma (${cezaDk} Dk)`, `${message.author.tag} (${limitMesaj} mesaj / ${ayar.spamSaniye} sn)`, 'Oto-Mod');
            message.channel.send(`🔇 ${message.author}, çok hızlı mesaj gönderdiğin için **${cezaDk} dakika** susturuldun!`).catch(() => {});
            return true;
        }
    }

    return false;
}

// --- TEK VE MERKEZİ MESAJ DİNLEYİCİSİ ---
client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const ayar = getGuildAyarlar(guildId);
    const icerikTrim = message.content.trim();
    const icerikKucuk = icerikTrim.toLocaleLowerCase('tr-TR');
    const isTicket = ticketKanaliMi(message.channel);

    // 1. Siteden Eklenen Özel Komutlar (!server, !ip, !site vb.)
    const ozelKomutlar = getGuildKomutlar(guildId);
    const eslesenKomut = ozelKomutlar.find(k => k.tetikleyici.toLocaleLowerCase('tr-TR') === icerikKucuk);
    if (eslesenKomut) {
        if (Array.isArray(ayar.komutKanallari) && ayar.komutKanallari.length > 0 && !ayar.komutKanallari.includes(message.channel.id)) {
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return message.reply({
                    content: `⚠️ Özel komutları sadece şu kanallarda kullanabilirsin: ${ayar.komutKanallari.map(id => `<#${id}>`).join(', ')}`,
                    allowedMentions: { repliedUser: false }
                }).then(m => setTimeout(() => m.delete().catch(() => {}), 4000)).catch(() => {});
            }
        }
        return message.reply({ content: eslesenKomut.cevap, allowedMentions: { repliedUser: false } }).catch(() => {});
    }

    // 2. Ticket Kanallarında Otomatik Moderasyon, Oyunlar ve Sohbet Yanıtları Çalışmaz
    if (isTicket) return;

    // 3. 1.000.000x Gelişmiş Oto-Moderasyon Kalkanı
    const engellendi = await gelismisModerasyonKontrol(message, ayar);
    if (engellendi) return;

    // 4. OWO TARZI PREFİX KOMUTLARI (k daily, k cf, k bj, k mine vb.)
    if (message.content.toLowerCase().startsWith('k ')) {
        const args = message.content.slice(2).trim().split(/ +/);
        const komut = args.shift().toLowerCase();
        const userId = message.author.id;
        let bakiye = getBakiye(userId);

        if (komut === 'owo-yardim' || komut === 'yardim' || komut === 'help') {
            const owoEmbed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('👑 KingMoney & OwO Komutları (`k` ön eki)')
                .addFields(
                    { name: '💰 Ekonomi', value: '`k daily` • `k money` (`k cash`) • `k give @üye [miktar]`' },
                    { name: '🎮 Kumarhane & Oyunlar', value: '`k cf [miktar]` • `k bj [miktar]` • `k mine [miktar] [bomba]`' },
                    { name: '🐾 Macera & Koleksiyon', value: '`k av` • `k zoo` • `k sat` • `k savas`' },
                    { name: '🤝 Sosyal Etkileşim', value: '`k saril @üye` • `k tokatla @üye` • `k besle @üye`' }
                );
            return message.reply({ embeds: [owoEmbed], allowedMentions: { repliedUser: false } });
        }

        if (komut === 'daily' || komut === 'gunluk') {
            const simdi = Date.now();
            const sonAlim = db.gunlukData.get(userId) || 0;
            if (simdi - sonAlim < 86400000) {
                const kalanSaat = Math.ceil((86400000 - (simdi - sonAlim)) / 3600000);
                return message.reply({ content: `⏳ Günlük ödülünü zaten aldın! Yaklaşık **${kalanSaat} saat** sonra tekrar alabilirsin.`, allowedMentions: { repliedUser: false } });
            }
            const odul = Number(ayar.gunlukOdul) || 250;
            db.gunlukData.set(userId, simdi);
            const yeniBakiye = bakiyeEkle(userId, odul);
            verileriKaydet();
            return message.reply({ content: `🎁 Günlük **+${odul} KingMoney** ödülün hesabına eklendi! (Güncel Bakiye: **${yeniBakiye} KingMoney**)`, allowedMentions: { repliedUser: false } });
        }

        if (['money', 'bakiye', 'cash', 'km', 'kingmoney'].includes(komut)) {
            const hedef = message.mentions.users.first() || message.author;
            const hedefBakiye = getBakiye(hedef.id);
            const hedefXpData = db.xpData.get(hedef.id) || { xp: 0, level: 1 };
            return message.reply({ content: `💳 **${hedef.username}** Cüzdanı ➔ Bakiye: **${hedefBakiye} KingMoney** | Seviye: **${hedefXpData.level}**`, allowedMentions: { repliedUser: false } });
        }

        if (komut === 'give' || komut === 'gonder') {
            const alici = message.mentions.users.first();
            const miktar = parseInt(args.find(a => !a.startsWith('<@')));
            if (!alici || alici.bot || alici.id === userId) {
                return message.reply({ content: '❌ Geçerli bir kullanıcı etiketlemelisin! Örnek: `k give @üye 100`', allowedMentions: { repliedUser: false } });
            }
            if (isNaN(miktar) || miktar <= 0 || bakiye < miktar) {
                return message.reply({ content: `❌ Geçerli ve bakiyene uygun bir miktar yaz! Mevcut: **${bakiye} KingMoney**`, allowedMentions: { repliedUser: false } });
            }
            setBakiye(userId, bakiye - miktar);
            bakiyeEkle(alici.id, miktar);
            verileriKaydet();
            return message.reply({ content: `💸 ${message.author}, ${alici} adlı kullanıcıya **${miktar} KingMoney** gönderdi!`, allowedMentions: { repliedUser: false } });
        }

        if (['saril', 'hug', 'tokatla', 'slap', 'besle', 'feed'].includes(komut)) {
            const hedef = message.mentions.users.first();
            if (!hedef) return message.reply({ content: `❌ Örnek: \`k ${komut} @üye\``, allowedMentions: { repliedUser: false } });
            let eylemMetni = '';
            if (komut === 'saril' || komut === 'hug') eylemMetni = `🤗 **${message.author.username}**, **${hedef.username}** adlı üyeye sıcacık sarıldı!`;
            if (komut === 'tokatla' || komut === 'slap') eylemMetni = `👋 **${message.author.username}**, **${hedef.username}** adlı üyeye şaplağı yapıştırdı!`;
            if (komut === 'besle' || komut === 'feed') eylemMetni = `🍕 **${message.author.username}**, **${hedef.username}** adlı üyeye lezzetli bir şeyler ikram etti!`;
            return message.reply({ content: eylemMetni, allowedMentions: { repliedUser: false } });
        }

        const oyunKomutlari = ['av', 'hunt', 'zoo', 'sat', 'sell', 'savas', 'battle', 'mine', 'kaz', 'cf', 'yazitura', 'bj', 'blackjack'];
        if (oyunKomutlari.includes(komut)) {
            // Siteden seçilen Kumarhane Kanalları kontrolü (Seçilmemişse isminde kumarhane geçen kanala bakar)
            const seciliKumarhaneler = ayar.kumarhaneKanallari || [];
            const kanalUygun = seciliKumarhaneler.length > 0
                ? seciliKumarhaneler.includes(message.channel.id)
                : message.channel.name.toLowerCase().includes('kumarhane');

            if (!kanalUygun) {
                const uyariKanal = seciliKumarhaneler.length > 0
                    ? seciliKumarhaneler.map(id => `<#${id}>`).join(', ')
                    : 'isminde **kumarhane** geçen kanal';
                return message.reply({ content: `⚠️ Bu komutu sadece ${uyariKanal} üzerinde kullanabilirsin!`, allowedMentions: { repliedUser: false } });
            }

            if (komut === 'cf' || komut === 'yazitura') {
                const miktar = parseInt(args[0]);
                if (isNaN(miktar) || miktar <= 0) {
                    const sonuc = Math.random() < 0.5 ? 'Yazı' : 'Tura';
                    return message.reply({ content: `🪙 Para havaya atıldı ve... **${sonuc}** geldi!`, allowedMentions: { repliedUser: false } });
                }
                if (bakiye < miktar) return message.reply({ content: `❌ Yetersiz bakiye! Mevcut: **${bakiye} KingMoney**`, allowedMentions: { repliedUser: false } });

                if (Math.random() < 0.5) {
                    const yeniBakiye = bakiyeEkle(userId, miktar);
                    verileriKaydet();
                    return message.reply({ content: `🪙 Kazandın! **+${miktar} KingMoney** eklendi. (Bakiye: **${yeniBakiye} KingMoney**)`, allowedMentions: { repliedUser: false } });
                } else {
                    setBakiye(userId, bakiye - miktar);
                    verileriKaydet();
                    return message.reply({ content: `🪙 Kaybettin! **-${miktar} KingMoney** düştü. (Bakiye: **${getBakiye(userId)} KingMoney**)`, allowedMentions: { repliedUser: false } });
                }
            }

            if (komut === 'bj' || komut === 'blackjack') {
                const miktar = parseInt(args[0]);
                if (isNaN(miktar) || miktar <= 0 || bakiye < miktar) {
                    return message.reply({ content: `❌ Geçerli bir bahis gir! Mevcut: **${bakiye} KingMoney**`, allowedMentions: { repliedUser: false } });
                }
                setBakiye(userId, bakiye - miktar);
                verileriKaydet();

                const oyuncuEl = [kartCek(), kartCek()];
                const kasaEl = [kartCek(), kartCek()];
                const puan = elPuaniHesapla(oyuncuEl);

                if (puan === 21) {
                    const kazanc = Math.floor(miktar * 2.5);
                    const yeniBakiye = bakiyeEkle(userId, kazanc);
                    verileriKaydet();
                    return message.reply({ content: `🃏 **Blackjack!** İlk ellerden 21 yaptın! **+${kazanc - miktar} KingMoney** net kâr. (Bakiye: **${yeniBakiye} KingMoney**)` });
                }

                const embed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle('🃏 Blackjack Masası')
                    .addFields(
                        { name: `Senin Elin (${puan})`, value: oyuncuEl.map(k => k.isim).join(' '), inline: true },
                        { name: `Kasa Eli`, value: `${kasaEl[0].isim} 🎴`, inline: true },
                        { name: 'Bahis', value: `${miktar} KingMoney`, inline: true }
                    );
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bj_hit').setLabel('Kart Çek (Hit) 🃏').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('bj_stand').setLabel('Dur (Stand) 🛑').setStyle(ButtonStyle.Success)
                );
                const msg = await message.reply({ embeds: [embed], components: [row], allowedMentions: { repliedUser: false } });
                aktifBlackjack.set(msg.id, { userId, miktar, oyuncuEl, kasaEl, baslangic: Date.now() });
                return;
            }

            if (komut === 'mine' || komut === 'kaz') {
                const miktar = parseInt(args[0]);
                if (isNaN(miktar) || miktar <= 0) {
                    const sonMaden = owoCooldown.get(`${userId}_mine`) || 0;
                    if (Date.now() - sonMaden < 5000) return message.reply({ content: '⏳ Birkaç saniye sonra tekrar kazabilirsin.', allowedMentions: { repliedUser: false } });
                    owoCooldown.set(`${userId}_mine`, Date.now());
                    const kazanilanKm = Math.floor(Math.random() * 80) + 20;
                    const yeniBakiye = bakiyeEkle(userId, kazanilanKm);
                    verileriKaydet();
                    return message.reply({ content: `⛏️ Madenden **+${kazanilanKm} KingMoney** çıkardın! (Bakiye: **${yeniBakiye} KingMoney**)`, allowedMentions: { repliedUser: false } });
                }
                if (bakiye < miktar) return message.reply({ content: `❌ Yetersiz bakiye! Mevcut: **${bakiye} KingMoney**`, allowedMentions: { repliedUser: false } });

                let bombaSayisi = Math.min(4, Math.max(1, parseInt(args[1]) || 1));
                setBakiye(userId, bakiye - miktar);
                verileriKaydet();

                const bombalar = new Set();
                while (bombalar.size < bombaSayisi) bombalar.add(Math.floor(Math.random() * 9));

                const embed = new EmbedBuilder()
                    .setColor('#f1c40f')
                    .setTitle('💣 Maden Oyunu (Mines)')
                    .setDescription(`Bahis: **${miktar} KingMoney** | Bomba: **${bombaSayisi}**\nÇarpan: **1.0x**`);

                const rows = [];
                for (let r = 0; r < 3; r++) {
                    const row = new ActionRowBuilder();
                    for (let c = 0; c < 3; c++) {
                        row.addComponents(new ButtonBuilder().setCustomId(`mine_tile_${r * 3 + c}`).setEmoji('🟦').setStyle(ButtonStyle.Secondary));
                    }
                    rows.push(row);
                }
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mine_cashout').setLabel('💰 Nakit Çek').setStyle(ButtonStyle.Success).setDisabled(true)));

                const msg = await message.reply({ embeds: [embed], components: rows, allowedMentions: { repliedUser: false } });
                aktifMine.set(msg.id, { userId, miktar, bombaSayisi, bombalar: Array.from(bombalar), acilanlar: new Set(), carpan: 1.0, baslangic: Date.now() });
                return;
            }

            if (komut === 'av' || komut === 'hunt') {
                const sonAv = owoCooldown.get(`${userId}_av`) || 0;
                if (Date.now() - sonAv < 5000) return message.reply({ content: '⏳ Birkaç saniye bekle.', allowedMentions: { repliedUser: false } });
                owoCooldown.set(`${userId}_av`, Date.now());
                const yakalanan = rastgeleHayvanSec();
                const userZoo = db.zooData.get(userId) || {};
                userZoo[yakalanan.ad] = (userZoo[yakalanan.ad] || 0) + 1;
                db.zooData.set(userId, userZoo);
                verileriKaydet();
                return message.reply({ content: `🏹 **${yakalanan.emoji} ${yakalanan.ad}** (*${yakalanan.nadirlik}*) yakaladın!`, allowedMentions: { repliedUser: false } });
            }

            if (komut === 'zoo') {
                const userZoo = db.zooData.get(userId) || {};
                const sahipOlunanlar = Object.entries(userZoo).filter(([, adet]) => adet > 0);
                if (sahipOlunanlar.length === 0) return message.reply({ content: '🐾 Hayvanat bahçen boş!', allowedMentions: { repliedUser: false } });
                const liste = sahipOlunanlar.map(([ad, adet]) => {
                    const bilgi = hayvanHavuzu.find(h => h.ad === ad) || { emoji: '🐾', deger: 10 };
                    return `${bilgi.emoji} **${ad}** ➔ **${adet} adet**`;
                }).join('\n');
                return message.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle(`🐾 ${message.author.username} - Hayvanat Bahçesi`).setDescription(liste)], allowedMentions: { repliedUser: false } });
            }

            if (komut === 'sat' || komut === 'sell') {
                const userZoo = db.zooData.get(userId) || {};
                const sahipOlunanlar = Object.entries(userZoo).filter(([, adet]) => adet > 0);
                if (sahipOlunanlar.length === 0) return message.reply({ content: '❌ Satacak hayvanın yok!', allowedMentions: { repliedUser: false } });
                let kazanc = 0;
                for (const [ad, adet] of sahipOlunanlar) {
                    const bilgi = hayvanHavuzu.find(h => h.ad === ad) || { deger: 10 };
                    kazanc += bilgi.deger * adet;
                }
                db.zooData.set(userId, {});
                const yeniBakiye = bakiyeEkle(userId, kazanc);
                verileriKaydet();
                return message.reply({ content: `💰 Hayvanlarını sattın ve **+${kazanc} KingMoney** kazandın! (Bakiye: **${yeniBakiye} KingMoney**)`, allowedMentions: { repliedUser: false } });
            }

            if (komut === 'savas' || komut === 'battle') {
                const sonSavas = owoCooldown.get(`${userId}_savas`) || 0;
                if (Date.now() - sonSavas < 8000) return message.reply({ content: '⏳ Takımın dinleniyor!', allowedMentions: { repliedUser: false } });
                owoCooldown.set(`${userId}_savas`, Date.now());
                const kazanilanKm = Math.floor(Math.random() * 50) + 25;
                const yeniBakiye = bakiyeEkle(userId, kazanilanKm);
                verileriKaydet();
                return message.reply({ content: `⚔️ Savaştan zaferle döndün! **+${kazanilanKm} KingMoney** (Bakiye: **${yeniBakiye} KingMoney**)`, allowedMentions: { repliedUser: false } });
            }
        }
        return;
    }

    // 5. AFK Kontrolü
    if (db.afkData.has(message.author.id)) {
        db.afkData.delete(message.author.id);
        verileriKaydet();
        message.reply({ content: '👋 Tekrar hoş geldin! AFK modundan çıkarıldın.', allowedMentions: { repliedUser: false } }).catch(() => {});
    }

    if (message.mentions.users.size > 0) {
        message.mentions.users.forEach(user => {
            if (db.afkData.has(user.id) && user.id !== message.author.id) {
                const afkBilgi = db.afkData.get(user.id);
                message.reply({ content: `💤 **${user.tag}** şu anda AFK! Sebep: **${afkBilgi.sebep}**`, allowedMentions: { repliedUser: false } }).catch(() => {});
            }
        });
    }

    // 6. Günün Sorusu Cevap Kontrolü
    const aktifSoru = aktifGununSorulari.get(message.channel.id);
    if (aktifSoru && aktifSoru.aktif) {
        const gelenMesaj = message.content.toLowerCase().trim();
        if (aktifSoru.cevaplar.some(c => gelenMesaj.includes(c))) {
            aktifSoru.aktif = false;
            message.react('🏆').catch(() => {});
            let bilgiRolu = message.guild.roles.cache.find(r => r.name === 'Günün Bilgini');
            if (!bilgiRolu) bilgiRolu = await message.guild.roles.create({ name: 'Günün Bilgini', color: '#FFD700' }).catch(() => null);
            if (bilgiRolu) await message.member.roles.add(bilgiRolu).catch(() => {});
            await xpEkle(message.guild, message.member, message.channel, 150);
            bakiyeEkle(message.author.id, 150);
            verileriKaydet();
            return message.reply({ content: `🎉 Tebrikler ${message.author}! Doğru cevabı ilk sen bildin ve **"Günün Bilgini"** rolü ile **+150 XP** ve **+150 KingMoney** kazandın! 👑`, allowedMentions: { repliedUser: false } });
        }
    }

    // 7. Bayrak Oyunu Kontrolü
    if (aktifBayrakOyunu.has(message.channel.id)) {
        const oyun = aktifBayrakOyunu.get(message.channel.id);
        if (oyun.cevaplar.includes(message.content.toLowerCase().trim())) {
            aktifBayrakOyunu.delete(message.channel.id);
            message.react('🚩').catch(() => {});
            await xpEkle(message.guild, message.member, message.channel, 50);
            bakiyeEkle(message.author.id, 50);
            verileriKaydet();
            return message.reply({ content: `🎉 Helal ${message.author}! Doğru ülke **${oyun.cevaplar[0].toUpperCase()}** idi. **+50 XP** ve **+50 KingMoney** kazandın!`, allowedMentions: { repliedUser: false } });
        }
    }

    // 8. Hızlı Yazma Yarışı Kontrolü
    if (aktifHizliYazi.has(message.channel.id)) {
        const oyun = aktifHizliYazi.get(message.channel.id);
        if (message.content.trim() === oyun.cumle) {
            aktifHizliYazi.delete(message.channel.id);
            message.react('⚡').catch(() => {});
            await xpEkle(message.guild, message.member, message.channel, 50);
            bakiyeEkle(message.author.id, 50);
            verileriKaydet();
            return message.reply({ content: `⚡ Şimşek gibisin ${message.author}! Cümleyi ilk ve hatasız sen yazdın. **+50 XP** ve **+50 KingMoney** kazandın!`, allowedMentions: { repliedUser: false } });
        }
    }

    // 9. Adam Asmaca Kontrolü
    if (aktifAdamAsmaca.has(message.channel.id)) {
        const oyun = aktifAdamAsmaca.get(message.channel.id);
        const tahmin = message.content.toLowerCase().trim();

        if (tahmin === oyun.kelime) {
            aktifAdamAsmaca.delete(message.channel.id);
            await xpEkle(message.guild, message.member, message.channel, 40);
            bakiyeEkle(message.author.id, 40);
            verileriKaydet();
            return message.reply({ content: `🏆 Tebrikler ${message.author}! Kelimeyi tek seferde bildin (**${oyun.kelime}**) ve **+40 XP** ile **+40 KingMoney** kazandın!`, allowedMentions: { repliedUser: false } });
        }

        if (tahmin.length === 1 && /^[a-zçğıöşü]$/.test(tahmin)) {
            if (oyun.tahminEdilenler.has(tahmin)) {
                return message.reply({ content: `⚠️ **"${tahmin.toUpperCase()}"** harfi zaten denendi!`, allowedMentions: { repliedUser: false } });
            }
            oyun.tahminEdilenler.add(tahmin);
            if (!oyun.kelime.includes(tahmin)) oyun.kalanHak -= 1;

            const gorunen = oyun.kelime.split('').map(h => oyun.tahminEdilenler.has(h) ? h.toUpperCase() : '_').join(' ');
            if (!gorunen.includes('_')) {
                aktifAdamAsmaca.delete(message.channel.id);
                await xpEkle(message.guild, message.member, message.channel, 40);
                bakiyeEkle(message.author.id, 40);
                verileriKaydet();
                return message.reply({ content: `🎉 Tebrikler ${message.author}! Kelime: **${oyun.kelime.toUpperCase()}** (+40 XP & +40 KingMoney)`, allowedMentions: { repliedUser: false } });
            }
            if (oyun.kalanHak <= 0) {
                aktifAdamAsmaca.delete(message.channel.id);
                return message.reply({ content: `💀 Can hakkınız bitti! Doğru kelime: **${oyun.kelime.toUpperCase()}**`, allowedMentions: { repliedUser: false } });
            }
            return message.reply({ content: `🔤 **Adam Asmaca:** \`${gorunen}\`\n❤️ Kalan Hak: **${oyun.kalanHak}**`, allowedMentions: { repliedUser: false } });
        }
    }

    // 10. Sayı Saymaca Oyunu Kontrolü
    const aktifSayi = aktifSayiOyunlari.get(message.channel.id);
    if (aktifSayi) {
        const yazilanSayi = parseInt(message.content.trim());
        if (!isNaN(yazilanSayi)) {
            if (aktifSayi.sonYazanId === message.author.id) {
                return message.reply({ content: `⚠️ Art arda iki kez sayı yazamazsın!`, allowedMentions: { repliedUser: false } });
            }
            if (yazilanSayi === aktifSayi.sonrakiSayi) {
                message.react('✅').catch(() => {});
                aktifSayi.sonrakiSayi++;
                aktifSayi.sonYazanId = message.author.id;
                await xpEkle(message.guild, message.member, message.channel, 2);
                bakiyeEkle(message.author.id, 2);
                verileriKaydet();
                return;
            } else {
                aktifSayi.sonrakiSayi = 1;
                aktifSayi.sonYazanId = null;
                return message.reply({ content: `❌ Yanlış sayı! Oyun **1**'den tekrar başladı!`, allowedMentions: { repliedUser: false } });
            }
        }
    }

    // 11. Kelime Türetmece Oyunu Kontrolü
    const aktifKelime = aktifKelimeOyunlari.get(message.channel.id);
    if (aktifKelime && aktifKelime.kelime) {
        const gelenKelime = message.content.toLowerCase().trim();
        const sonHarf = aktifKelime.kelime.slice(-1);

        if (aktifKelime.sonYazanId === message.author.id || gelenKelime.length < 3 || (kelimeSeti.size > 0 && !kelimeSeti.has(gelenKelime))) {
            return;
        }
        if (gelenKelime.startsWith(sonHarf)) {
            aktifKelime.kelime = gelenKelime;
            aktifKelime.sonYazanId = message.author.id;
            message.react('✅').catch(() => {});
            await xpEkle(message.guild, message.member, message.channel, 15);
            bakiyeEkle(message.author.id, 15);
            verileriKaydet();
            return;
        }
    }

    // 12. Normal Mesaj Başına +5 XP ve +5 KingMoney
    await xpEkle(message.guild, message.member, message.channel, 5);
    bakiyeEkle(message.author.id, 5);
    verileriKaydet();

    // 13. Akıllı Sohbet Yanıtları
    const icerik = message.content.toLowerCase().trim();
    if (icerik === 'sa' || icerik === 's.a' || icerik === 'selamun aleykum') {
        message.reply({ content: 'Aleykümselam, hoş geldin! Nasılsın? 👋', allowedMentions: { repliedUser: false } }).catch(() => {});
    } else if (icerik === 'merhaba' || icerik === 'selam' || icerik === 'slm') {
        message.reply({ content: 'Selamlar, hoş geldin! Keyifler nasıl? 😊', allowedMentions: { repliedUser: false } }).catch(() => {});
    } else if (icerik === 'günaydın' || icerik === 'gunaydin') {
        message.reply({ content: 'Günaydın, harika bir gün geçirmen dileğiyle! ☀️', allowedMentions: { repliedUser: false } }).catch(() => {});
    } else if (icerik === 'iyi geceler') {
        message.reply({ content: 'İyi geceler, tatlı rüyalar! 🌙', allowedMentions: { repliedUser: false } }).catch(() => {});
    } else if (icerik === 'eyvallah' || icerik === 'sağ ol' || icerik === 'sagol') {
        message.reply({ content: 'Ne demek, her zaman! 🤝', allowedMentions: { repliedUser: false } }).catch(() => {});
    }
});

// --- TEK VE MERKEZİ ETKİLEŞİM (SLASH KOMUT, BUTON, MENÜ) DİNLEYİCİSİ ---
client.on('interactionCreate', async interaction => {
    try {
        if (!interaction.guild) return;
        const guildId = interaction.guild.id;
        const ayar = getGuildAyarlar(guildId);

        // A. AÇILIR MENÜ (SELECT MENU) ETKİLEŞİMLERİ
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_kategori_sec') {
                const secilenId = interaction.values[0];
                const konuObj = (ayar.ticketKonular || []).find(k => k.id === secilenId) || { isim: 'Genel Destek', emoji: '🎫' };

                const mevcutKanal = interaction.guild.channels.cache.find(c => c.topic?.includes(`SAHIP:${interaction.user.id}`));
                if (mevcutKanal) {
                    return interaction.update({ content: `❌ Zaten açık bir destek talebin bulunuyor: ${mevcutKanal}`, components: [] }).catch(() => {});
                }

                await interaction.update({ content: '⏳ Destek kanalınız hazırlanıyor...', components: [] }).catch(() => {});

                try {
                    const izinler = [
                        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        {
                            id: interaction.user.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                        }
                    ];

                    // Birden Fazla Standart Destek Rolü: Kanalı GÖRÜR ama İLGİLEN'e basana kadar YAZAMAZ
                    const destekRolleri = Array.isArray(ayar.ticketYetkiliRoller) ? ayar.ticketYetkiliRoller : [];
                    destekRolleri.forEach(rolId => {
                        if (interaction.guild.roles.cache.has(rolId)) {
                            izinler.push({
                                id: rolId,
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
                                deny: [PermissionsBitField.Flags.SendMessages]
                            });
                        }
                    });

                    // Birden Fazla Tam Yetkili Üst Yönetim Rolü: Her türlü GÖRÜR ve YAZAR
                    const tamYetkiliRoller = Array.isArray(ayar.ticketTamYetkiliRoller) ? ayar.ticketTamYetkiliRoller : [];
                    tamYetkiliRoller.forEach(rolId => {
                        if (interaction.guild.roles.cache.has(rolId)) {
                            izinler.push({
                                id: rolId,
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                            });
                        }
                    });

                    const temizKullanici = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'uye';
                    const kanal = await interaction.guild.channels.create({
                        name: `ticket-${temizKullanici}`,
                        type: ChannelType.GuildText,
                        parent: ayar.ticketKategori || null,
                        topic: `KINGBOT_TICKET | SAHIP:${interaction.user.id} | KONU:${konuObj.isim}`,
                        permissionOverwrites: izinler
                    });

                    const embed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle(`${konuObj.emoji} ${konuObj.isim} — Destek Talebi`)
                        .setDescription(`Merhaba <@${interaction.user.id}>, talebin başarıyla oluşturuldu.\n\n**Kategori:** ${konuObj.isim}\n**Durum:** 🟡 Yetkili Bekleniyor\n\n*Not: Bir yetkili **"✋ İlgilen"** butonuna bastığında yalnızca o yetkili, talep sahibi ve üst yönetim bu kanala yazabilecektir.*`)
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ticket_ilgilen')
                            .setLabel('İlgilen (Sahiplen)')
                            .setEmoji('✋')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('ticket_kapat')
                            .setLabel('Talebi Kapat & Kaydet')
                            .setEmoji('🔒')
                            .setStyle(ButtonStyle.Danger)
                    );

                    const etiketMetni = destekRolleri.map(id => `<@&${id}>`).join(' ');
                    await kanal.send({
                        content: `<@${interaction.user.id}> ${etiketMetni}`,
                        embeds: [embed],
                        components: [row]
                    });

                    logEkle(guildId, 'TICKET', 'Ticket Açıldı', `#${kanal.name} (${konuObj.isim}) açıldı`, interaction.user.tag);
                    await interaction.followUp({ content: `✅ Destek talebin açıldı: ${kanal}`, flags: MessageFlags.Ephemeral }).catch(() => {});
                } catch (err) {
                    console.error('Ticket Oluşturma Hatası:', err);
                    await interaction.followUp({ content: '❌ Ticket açılamadı! Botun "Kanalları Yönet" yetkisini kontrol edin.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            }
            return;
        }

        // B. BUTON ETKİLEŞİMLERİ
        if (interaction.isButton()) {
            // 1. Butonlu Rol Alma (Self-Role)
            if (interaction.customId.startsWith('selfrole_')) {
                const rolId = interaction.customId.replace('selfrole_', '');
                const rol = interaction.guild.roles.cache.get(rolId);
                if (!rol) return interaction.reply({ content: '❌ Bu rol artık sunucuda bulunmuyor.', flags: MessageFlags.Ephemeral });

                try {
                    if (interaction.member.roles.cache.has(rolId)) {
                        await interaction.member.roles.remove(rol);
                        logEkle(guildId, 'ROL', 'Butonla Rol Alındı', `@${rol.name} rolünü kendi üzerinden kaldırdı`, interaction.user.tag);
                        return interaction.reply({ content: `➖ **${rol.name}** rolü üzerinizden alındı.`, flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.member.roles.add(rol);
                        logEkle(guildId, 'ROL', 'Butonla Rol Verildi', `@${rol.name} rolünü butonla aldı`, interaction.user.tag);
                        return interaction.reply({ content: `✅ **${rol.name}** rolü üzerinize verildi!`, flags: MessageFlags.Ephemeral });
                    }
                } catch {
                    return interaction.reply({ content: '❌ Botun rolü bu rolün üstünde olmalı!', flags: MessageFlags.Ephemeral });
                }
            }

            // 2. Ticket Oluştur Butonu -> Kategori Menüsü Aç
            if (interaction.customId === 'ticket_olustur') {
                const konular = ayar.ticketKonular || [];
                if (konular.length === 0) {
                    return interaction.reply({ content: '❌ Sistemde tanımlı destek kategorisi bulunmuyor.', flags: MessageFlags.Ephemeral });
                }

                const menu = new StringSelectMenuBuilder()
                    .setCustomId('ticket_kategori_sec')
                    .setPlaceholder('Lütfen destek almak istediğiniz konuyu seçin...')
                    .addOptions(
                        konular.slice(0, 25).map(k => ({
                            label: k.isim,
                            description: k.aciklama || 'Destek talebi oluştur',
                            value: k.id,
                            emoji: k.emoji || '🎫'
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(menu);
                return interaction.reply({
                    content: '📋 Destek talebinizi doğru ekibe yönlendirebilmemiz için aşağıdan bir kategori seçin:',
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
            }

            // 3. Ticket "İlgilen" Butonu -> Çoklu Rol Desteği ile Sahiplenme
            if (interaction.customId === 'ticket_ilgilen') {
                const destekRolleri = Array.isArray(ayar.ticketYetkiliRoller) ? ayar.ticketYetkiliRoller : [];
                const tamYetkiliRoller = Array.isArray(ayar.ticketTamYetkiliRoller) ? ayar.ticketTamYetkiliRoller : [];

                const yetkiliMi = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    destekRolleri.some(id => interaction.member.roles.cache.has(id)) ||
                    tamYetkiliRoller.some(id => interaction.member.roles.cache.has(id));

                if (!yetkiliMi) {
                    return interaction.reply({ content: '❌ Bu talebi yalnızca destek yetkilileri sahiplenebilir!', flags: MessageFlags.Ephemeral });
                }

                // Tüm standart destek rollerinin yazmasını kesin kapat
                for (const rolId of destekRolleri) {
                    await interaction.channel.permissionOverwrites.edit(rolId, {
                        ViewChannel: true,
                        ReadMessageHistory: true,
                        SendMessages: false
                    }).catch(() => {});
                }

                // Tüm tam yetkili rollerin yazma iznini açık tut
                for (const rolId of tamYetkiliRoller) {
                    await interaction.channel.permissionOverwrites.edit(rolId, {
                        ViewChannel: true,
                        ReadMessageHistory: true,
                        SendMessages: true
                    }).catch(() => {});
                }

                // Sadece "İlgilen" tuşuna basan yetkiliye yazma izni aç
                await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }).catch(() => {});

                const yeniRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_ilgilen')
                        .setLabel(`İlgilenen: ${interaction.user.username}`)
                        .setEmoji('✅')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('ticket_kapat')
                        .setLabel('Talebi Kapat & Kaydet')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.update({ components: [yeniRow] }).catch(() => {});
                await interaction.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#23a55a')
                            .setDescription(`✋ Bu destek talebi **<@${interaction.user.id}>** tarafından devralındı. Artık yalnızca talep sahibi, ilgilenen yetkili ve üst yönetim bu kanala yazabilir.`)
                    ]
                }).catch(() => {});

                logEkle(guildId, 'TICKET', 'Ticket Sahiplenildi', `#${interaction.channel.name} talebini devraldı`, interaction.user.tag);
                return;
            }

            // 4. Ticket Kapat Butonu -> Null Kanal Korumalı & Çökme Önleyici Arşivleme
            if (interaction.customId === 'ticket_kapat') {
                const hedefKanal = interaction.channel;
                if (!hedefKanal) return;

                await interaction.reply({ content: '💾 Konuşma geçmişi site arşivine kaydediliyor, kanal 5 saniye içinde silinecek...' }).catch(() => {});

                try {
                    const mesajlar = await hedefKanal.messages.fetch({ limit: 100 });
                    const siraliMesajlar = Array.from(mesajlar.values())
                        .reverse()
                        .filter(m => !m.author.bot || m.content)
                        .map(m => ({
                            yazar: m.author.tag,
                            avatar: m.author.displayAvatarURL({ size: 64 }),
                            icerik: m.content || '[Embed / Ek]',
                            zaman: m.createdAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        }));

                    const topicBilgi = hedefKanal.topic || '';
                    const konuMatch = topicBilgi.match(/KONU:([^|]+)/);
                    const konuAdi = konuMatch ? konuMatch[1].trim() : 'Genel Destek';

                    const biletler = getGuildBiletler(guildId);
                    biletler.unshift({
                        id: Date.now(),
                        kanalAdi: hedefKanal.name,
                        konu: konuAdi,
                        kapatan: interaction.user.tag,
                        kapanisTarihi: new Date().toLocaleString('tr-TR'),
                        mesajSayisi: siraliMesajlar.length,
                        mesajlar: siraliMesajlar
                    });
                    if (biletler.length > 150) biletler.pop();
                    verileriKaydet();

                    logEkle(guildId, 'TICKET', 'Ticket Kapatıldı & Arşivlendi', `#${hedefKanal.name} (${siraliMesajlar.length} mesaj) arşive eklendi`, interaction.user.tag);
                } catch (err) {
                    console.error('Transkript Kayıt Hatası:', err);
                }

                const silinecekKanalId = hedefKanal.id;
                setTimeout(async () => {
                    const guncelKanal = interaction.guild.channels.cache.get(silinecekKanalId);
                    if (guncelKanal) await guncelKanal.delete().catch(() => {});
                }, 5000);
                return;
            }

            // 5. Blackjack Butonları
            if (interaction.customId === 'bj_hit' || interaction.customId === 'bj_stand') {
                const oyun = aktifBlackjack.get(interaction.message.id);
                if (!oyun) return interaction.reply({ content: '❌ Bu oyun artık aktif değil.', flags: MessageFlags.Ephemeral });
                if (oyun.userId !== interaction.user.id) return interaction.reply({ content: '❌ Bu masayı sen kurmadın!', flags: MessageFlags.Ephemeral });

                if (interaction.customId === 'bj_hit') {
                    oyun.oyuncuEl.push(kartCek());
                    const puan = elPuaniHesapla(oyun.oyuncuEl);

                    if (puan > 21) {
                        aktifBlackjack.delete(interaction.message.id);
                        const guncelBakiye = getBakiye(interaction.user.id);
                        const embed = new EmbedBuilder()
                            .setColor('#e74c3c')
                            .setTitle('🃏 Blackjack - BUST!')
                            .addFields(
                                { name: `Elin (${puan})`, value: oyun.oyuncuEl.map(k => k.isim).join(' '), inline: true },
                                { name: 'Sonuç', value: `21'i geçtin ve **${oyun.miktar} KingMoney** kaybettin! 💀\nBakiye: **${guncelBakiye} KingMoney**`, inline: true }
                            );
                        return interaction.update({ embeds: [embed], components: [] });
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#3498db')
                        .setTitle('🃏 Blackjack Masası')
                        .addFields(
                            { name: `Senin Elin (${puan})`, value: oyun.oyuncuEl.map(k => k.isim).join(' '), inline: true },
                            { name: `Kasa Eli`, value: `${oyun.kasaEl[0].isim} 🎴`, inline: true },
                            { name: 'Bahis', value: `${oyun.miktar} KingMoney`, inline: true }
                        );
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('bj_hit').setLabel('Kart Çek (Hit) 🃏').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('bj_stand').setLabel('Dur (Stand) 🛑').setStyle(ButtonStyle.Success)
                    );
                    return interaction.update({ embeds: [embed], components: [row] });
                }

                if (interaction.customId === 'bj_stand') {
                    aktifBlackjack.delete(interaction.message.id);
                    let oyuncuPuan = elPuaniHesapla(oyun.oyuncuEl);
                    let kasaPuan = elPuaniHesapla(oyun.kasaEl);
                    while (kasaPuan < 17) {
                        oyun.kasaEl.push(kartCek());
                        kasaPuan = elPuaniHesapla(oyun.kasaEl);
                    }

                    let sonucMetni = '';
                    let renk = '#3498db';
                    if (kasaPuan > 21 || oyuncuPuan > kasaPuan) {
                        bakiyeEkle(interaction.user.id, oyun.miktar * 2);
                        sonucMetni = `🏆 Kazandın! **+${oyun.miktar} KingMoney** kâr elde ettin!`;
                        renk = '#2ecc71';
                    } else if (oyuncuPuan === kasaPuan) {
                        bakiyeEkle(interaction.user.id, oyun.miktar);
                        sonucMetni = `🤝 Berabere! Bahsin iade edildi.`;
                        renk = '#f1c40f';
                    } else {
                        sonucMetni = `💀 Kasa kazandı! **-${oyun.miktar} KingMoney** kaybettin.`;
                        renk = '#e74c3c';
                    }
                    verileriKaydet();

                    const embed = new EmbedBuilder()
                        .setColor(renk)
                        .setTitle('🃏 Blackjack - Sonuç')
                        .addFields(
                            { name: `Senin Elin (${oyuncuPuan})`, value: oyun.oyuncuEl.map(k => k.isim).join(' '), inline: true },
                            { name: `Kasa Eli (${kasaPuan})`, value: oyun.kasaEl.map(k => k.isim).join(' '), inline: true },
                            { name: 'Sonuç', value: `${sonucMetni}\nBakiye: **${getBakiye(interaction.user.id)} KingMoney**`, inline: false }
                        );
                    return interaction.update({ embeds: [embed], components: [] });
                }
            }

            // 6. Minesweeper Butonları
            if (interaction.customId.startsWith('mine_tile_') || interaction.customId === 'mine_cashout') {
                const oyun = aktifMine.get(interaction.message.id);
                if (!oyun) return interaction.reply({ content: '❌ Bu oyun süresi dolmuş.', flags: MessageFlags.Ephemeral });
                if (oyun.userId !== interaction.user.id) return interaction.reply({ content: '❌ Bu oyunu sen başlatmadın!', flags: MessageFlags.Ephemeral });

                if (interaction.customId === 'mine_cashout') {
                    aktifMine.delete(interaction.message.id);
                    const kazanilan = Math.floor(oyun.miktar * oyun.carpan);
                    const guncelBakiye = bakiyeEkle(interaction.user.id, kazanilan);
                    verileriKaydet();
                    return interaction.update({
                        embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('💰 Maden Oyunu - Nakit Çekildi!').setDescription(`Çarpan: **${oyun.carpan.toFixed(2)}x**\nKazanılan: **+${kazanilan} KingMoney**\nBakiye: **${guncelBakiye} KingMoney**`)],
                        components: []
                    });
                }

                const tileIndex = parseInt(interaction.customId.replace('mine_tile_', ''));
                if (oyun.bombalar.includes(tileIndex)) {
                    aktifMine.delete(interaction.message.id);
                    return interaction.update({
                        embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('💥 BOMBA PATLADI!').setDescription(`**${oyun.miktar} KingMoney** kaybettin! 💀`)],
                        components: []
                    });
                }

                if (oyun.acilanlar.has(tileIndex)) return interaction.reply({ content: '⚠️ Bu kutu zaten açıldı!', flags: MessageFlags.Ephemeral });
                oyun.acilanlar.add(tileIndex);
                oyun.carpan += 0.35 * oyun.bombaSayisi;

                const toplamGuvenli = 9 - oyun.bombaSayisi;
                if (oyun.acilanlar.size >= toplamGuvenli) {
                    aktifMine.delete(interaction.message.id);
                    const kazanilan = Math.floor(oyun.miktar * oyun.carpan);
                    const guncelBakiye = bakiyeEkle(interaction.user.id, kazanilan);
                    verileriKaydet();
                    return interaction.update({
                        embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 TÜM GÜVENLİ KUTULARI BULDUN!').setDescription(`Kazanılan: **+${kazanilan} KingMoney**\nBakiye: **${guncelBakiye} KingMoney**`)],
                        components: []
                    });
                }

                const guncelKazanc = Math.floor(oyun.miktar * oyun.carpan);
                const rows = [];
                for (let r = 0; r < 3; r++) {
                    const row = new ActionRowBuilder();
                    for (let c = 0; c < 3; c++) {
                        const index = r * 3 + c;
                        const acildi = oyun.acilanlar.has(index);
                        row.addComponents(new ButtonBuilder().setCustomId(`mine_tile_${index}`).setEmoji(acildi ? '💎' : '🟦').setStyle(acildi ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(acildi));
                    }
                    rows.push(row);
                }
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mine_cashout').setLabel(`💰 Nakit Çek (${guncelKazanc} KingMoney)`).setStyle(ButtonStyle.Success)));

                return interaction.update({
                    embeds: [new EmbedBuilder().setColor('#f1c40f').setTitle('💣 Maden Oyunu (Mines)').setDescription(`Çarpan: **${oyun.carpan.toFixed(2)}x** (Potansiyel: **${guncelKazanc} KingMoney**)`)],
                    components: rows
                });
            }

            // 7. Anket Butonları
            if (interaction.customId === 'poll_opt1' || interaction.customId === 'poll_opt2') {
                const anket = aktifAnketler.get(interaction.message.id);
                if (!anket) return interaction.reply({ content: '❌ Bu anket artık aktif değil.', flags: MessageFlags.Ephemeral });

                anket.votes1.delete(interaction.user.id);
                anket.votes2.delete(interaction.user.id);
                if (interaction.customId === 'poll_opt1') anket.votes1.add(interaction.user.id);
                else anket.votes2.add(interaction.user.id);

                const guncelEmbed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('📊 İnteraktif Anket')
                    .setDescription(`> **${anket.soru}**\n\n1️⃣ **${anket.secenek1}** ➔ **${anket.votes1.size}** oy\n2️⃣ **${anket.secenek2}** ➔ **${anket.votes2.size}** oy`)
                    .setTimestamp();
                return interaction.update({ embeds: [guncelEmbed] });
            }

            // 8. Düello Butonları
            if (interaction.customId === 'duello_kabul' || interaction.customId === 'duello_red') {
                const duello = aktifDuellolar.get(interaction.message.id);
                if (!duello) return interaction.reply({ content: '❌ Bu düello geçersiz.', flags: MessageFlags.Ephemeral });

                if (interaction.customId === 'duello_red') {
                    if (interaction.user.id !== duello.rakipId && interaction.user.id !== duello.meydanOkuyanId) {
                        return interaction.reply({ content: '❌ Bu düello sana ait değil.', flags: MessageFlags.Ephemeral });
                    }
                    aktifDuellolar.delete(interaction.message.id);
                    return interaction.update({ content: `🚫 Düello iptal edildi.`, embeds: [], components: [] });
                }

                if (interaction.user.id !== duello.rakipId) {
                    return interaction.reply({ content: '❌ Sadece meydan okunan kişi kabul edebilir!', flags: MessageFlags.Ephemeral });
                }

                if (getBakiye(duello.meydanOkuyanId) < duello.miktar || getBakiye(duello.rakipId) < duello.miktar) {
                    aktifDuellolar.delete(interaction.message.id);
                    return interaction.update({ content: '❌ Taraflardan birinin bakiyesi yetersiz.', embeds: [], components: [] });
                }

                aktifDuellolar.delete(interaction.message.id);
                const kazananId = Math.random() < 0.5 ? duello.meydanOkuyanId : duello.rakipId;
                const kaybedenId = kazananId === duello.meydanOkuyanId ? duello.rakipId : duello.meydanOkuyanId;

                bakiyeEkle(kazananId, duello.miktar);
                setBakiye(kaybedenId, getBakiye(kaybedenId) - duello.miktar);
                verileriKaydet();

                return interaction.update({
                    embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('⚔️ DÜELLO SONUÇLANDI!').setDescription(`🏆 **Kazanan:** <@${kazananId}> (**+${duello.miktar} KingMoney**)\n💀 **Kaybeden:** <@${kaybedenId}> (**-${duello.miktar} KingMoney**)`)],
                    components: []
                });
            }

            // 9. Doğruluk mu Cesaretlik mi Butonları
            if (interaction.customId === 'dc_dogruluk' || interaction.customId === 'dc_cesaret') {
                const tur = interaction.customId === 'dc_dogruluk' ? 'Doğruluk' : 'Cesaret';
                const havuz = tur === 'Doğruluk' ? dogrulukSorulari : cesaretGorevleri;
                const secilen = havuz[Math.floor(Math.random() * havuz.length)];
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(tur === 'Doğruluk' ? '#3498db' : '#e74c3c').setTitle(`🎭 ${tur.toUpperCase()}!`).setDescription(`${interaction.user} seçti:\n\n> **${secilen}**`)]
                });
            }
            return;
        }

        // C. SLASH KOMUTLARI
        if (!interaction.isChatInputCommand()) return;
        const { commandName } = interaction;

        // Siteden Ayarlanan Oyun Kanalı Kısıtlaması
        const oyunSlashKomutlari = ['kelime-oyunu-baslat', 'sayi-oyunu-baslat', 'adam-asmaca', 'bayrak-oyunu', 'hizli-yazi', 'dc', 'zar', 'yazi-tura', 'espri'];
        if (oyunSlashKomutlari.includes(commandName) && Array.isArray(ayar.oyunKanallari) && ayar.oyunKanallari.length > 0) {
            if (!ayar.oyunKanallari.includes(interaction.channel.id) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({
                    content: `🎮 Oyun komutlarını yalnızca şu kanallarda kullanabilirsin: ${ayar.oyunKanallari.map(id => `<#${id}>`).join(', ')}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        if (commandName === 'yardim') {
            const yardimEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🤖 Gelişmiş Sunucu Botu Komut Menüsü')
                .addFields(
                    { name: '🛠️ Moderasyon & Ticket', value: '`/sil` • `/at` • `/yasakla` • `/unban` • `/sustur` • `/kilitle` • `/ac` • `/rol-ver` • `/rol-al` • `/yavasmod` • `/uyar` • `/uyarilar` • `/uyari-sil` • `/oto-mod` • `/ticket-ekle` • `/ticket-cikar`' },
                    { name: '👑 KingMoney & Seviye', value: '`/profil` • `/gunluk` • `/seviye` • `/siralama` • `/market` • `/satin-al` • `/gonder` • `/duello` • `k owo-yardim`' },
                    { name: '🎮 Mini Oyunlar', value: '`/kelime-oyunu-baslat` • `/sayi-oyunu-baslat` • `/adam-asmaca` • `/bayrak-oyunu` • `/hizli-yazi` • `/dc` • `/gunun-sorusu` • `/zar` • `/yazi-tura` • `/espri`' },
                    { name: '📢 Topluluk & Araçlar', value: '`/itiraf` • `/oneri` • `/afk` • `/hatirlat` • `/anket` • `/cekilis` • `/duyuru` • `/ping` • `/avatar` • `/sunucu-bilgi`' }
                );
            await interaction.reply({ embeds: [yardimEmbed] });
        }
        else if (commandName === 'ping') {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏓 Pong!').setDescription(`Gecikme: **${client.ws.ping}ms** 🚀`)] });
        }
        else if (commandName === 'avatar') {
            const hedef = interaction.options.getUser('kullanici') || interaction.user;
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF69B4').setTitle(`${hedef.tag} - Avatar`).setImage(hedef.displayAvatarURL({ size: 1024, dynamic: true }))] });
        }
        else if (commandName === 'sunucu-bilgi') {
            const { guild } = interaction;
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor('#00BFFF').setTitle(`📊 ${guild.name} İstatistikleri`).addFields(
                    { name: '👑 Sahip', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '👥 Üye Sayısı', value: `${guild.memberCount} kişi`, inline: true }
                )]
            });
        }
        else if (commandName === 'profil' || commandName === 'seviye') {
            const hedef = interaction.options.getUser('kullanici') || interaction.user;
            const data = db.xpData.get(hedef.id) || { xp: 0, level: 1 };
            const gereken = gerekenXpHesapla(data.level, ayar.xpZorlukCarpani);
            const kmBakiye = getBakiye(hedef.id);
            const uyariSayisi = (db.uyarilar.get(hedef.id) || []).length;
            const toplamHayvan = Object.values(db.zooData.get(hedef.id) || {}).reduce((a, b) => a + b, 0);

            const profilEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setAuthor({ name: `${hedef.tag} — Oyuncu Profili`, iconURL: hedef.displayAvatarURL() })
                .setThumbnail(hedef.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: '🎖️ Seviye', value: `**Level ${data.level}**`, inline: true },
                    { name: '✨ XP İlerlemesi', value: `**${data.xp}** / **${gereken} XP**`, inline: true },
                    { name: '👑 KingMoney', value: `**${kmBakiye} KM**`, inline: true },
                    { name: '🐾 Hayvan Sayısı', value: `${toplamHayvan} hayvan`, inline: true },
                    { name: '⚠️ Uyarı Sicili', value: `${uyariSayisi} uyarı`, inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [profilEmbed] });
        }
        else if (commandName === 'ticket-ekle') {
            if (!ticketKanaliMi(interaction.channel)) return interaction.reply({ content: '❌ Bu komut sadece ticket kanallarında kullanılabilir.', flags: MessageFlags.Ephemeral });
            const hedef = interaction.options.getMember('kullanici');
            await interaction.channel.permissionOverwrites.edit(hedef.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
            await interaction.reply(`✅ ${hedef} bu destek talebine eklendi.`);
        }
        else if (commandName === 'ticket-cikar') {
            if (!ticketKanaliMi(interaction.channel)) return interaction.reply({ content: '❌ Bu komut sadece ticket kanallarında kullanılabilir.', flags: MessageFlags.Ephemeral });
            const hedef = interaction.options.getMember('kullanici');
            await interaction.channel.permissionOverwrites.delete(hedef.id);
            await interaction.reply(`➖ ${hedef} bu destek talebinden çıkarıldı.`);
        }
        else if (commandName === 'sil') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const miktar = Math.min(100, Math.max(1, interaction.options.getInteger('sayi')));
            await interaction.channel.bulkDelete(miktar, true).catch(() => {});
            await interaction.reply({ content: `✅ ${miktar} mesaj silindi.`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'at') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const hedefUye = interaction.options.getMember('kullanici');
            const sebep = interaction.options.getString('sebep') || 'Belirtilmedi';
            await hedefUye.kick(sebep);
            await interaction.reply(`🥾 **${hedefUye.user.tag}** atıldı. Sebep: ${sebep}`);
        }
        else if (commandName === 'yasakla') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const hedefUye = interaction.options.getMember('kullanici');
            const sebep = interaction.options.getString('sebep') || 'Belirtilmedi';
            await hedefUye.ban({ reason: sebep });
            await interaction.reply(`🔨 **${hedefUye.user.tag}** yasaklandı. Sebep: ${sebep}`);
        }
        else if (commandName === 'unban') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const id = interaction.options.getString('id');
            try {
                await interaction.guild.members.unban(id);
                await interaction.reply(`✅ Yasak kaldırıldı.`);
            } catch {
                await interaction.reply({ content: '❌ Yasaklı kullanıcı bulunamadı.', flags: MessageFlags.Ephemeral });
            }
        }
        else if (commandName === 'sustur') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const hedefUye = interaction.options.getMember('kullanici');
            const dakika = interaction.options.getInteger('dakika');
            const sebep = interaction.options.getString('sebep') || 'Belirtilmedi';
            await hedefUye.timeout(dakika * 60 * 1000, sebep);
            await interaction.reply(`🔇 **${hedefUye.user.tag}** ${dakika} dakika susturuldu.`);
        }
        else if (commandName === 'kilitle') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
            await interaction.reply('🔒 Kanal kilitlendi.');
        }
        else if (commandName === 'ac') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
            await interaction.reply('🔓 Kanal açıldı.');
        }
        else if (commandName === 'rol-ver') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const uye = interaction.options.getMember('kullanici');
            const rol = interaction.options.getRole('rol');
            await uye.roles.add(rol);
            await interaction.reply(`✅ **${uye.user.tag}** kullanıcısına **${rol.name}** rolü verildi.`);
        }
        else if (commandName === 'rol-al') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const uye = interaction.options.getMember('kullanici');
            const rol = interaction.options.getRole('rol');
            await uye.roles.remove(rol);
            await interaction.reply(`✅ **${uye.user.tag}** kullanıcısından **${rol.name}** rolü alındı.`);
        }
        else if (commandName === 'yavasmod') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const saniye = interaction.options.getInteger('saniye');
            await interaction.channel.setRateLimitPerUser(saniye);
            await interaction.reply({ content: `✅ Yavaş mod ${saniye} saniye yapıldı.`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'uyar') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const hedefUye = interaction.options.getMember('kullanici');
            const sebep = interaction.options.getString('sebep');

            const liste = db.uyarilar.get(hedefUye.id) || [];
            liste.push({ sebep, yetkili: interaction.user.tag, tarih: new Date().toLocaleDateString('tr-TR') });
            db.uyarilar.set(hedefUye.id, liste);
            verileriKaydet();

            let ekMesaj = '';
            if (liste.length >= 3 && liste.length % 3 === 0) {
                await hedefUye.timeout(10 * 60 * 1000, '3 Uyarı Sınırı').catch(() => {});
                ekMesaj = '\n🔇 **3 uyarı sınırına ulaştığı için otomatik olarak 10 dakika susturuldu!**';
            }

            await interaction.reply(`⚠️ **${hedefUye.user.tag}** uyarıldı! (Toplam Uyarı: **${liste.length}**)\n**Sebep:** ${sebep}${ekMesaj}`);
            logEkle(guildId, 'MODERASYON', 'Üye Uyarıldı', `${hedefUye.user.tag} (${liste.length}. uyarı) - Sebep: ${sebep}`, interaction.user.tag);
        }
        else if (commandName === 'uyarilar') {
            const hedef = interaction.options.getUser('kullanici');
            const liste = db.uyarilar.get(hedef.id) || [];
            if (liste.length === 0) return interaction.reply(`✅ **${hedef.tag}** adlı kullanıcının hiç uyarısı bulunmuyor.`);
            const metin = liste.map((u, i) => `**${i + 1}.** ${u.sebep} *(Yetkili: ${u.yetkili} - ${u.tarih})*`).join('\n');
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#f1c40f').setTitle(`📋 ${hedef.tag} - Uyarı Geçmişi (${liste.length})`).setDescription(metin)] });
        }
        else if (commandName === 'uyari-sil') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const hedef = interaction.options.getUser('kullanici');
            db.uyarilar.delete(hedef.id);
            verileriKaydet();
            await interaction.reply(`✅ **${hedef.tag}** adlı kullanıcının tüm uyarıları sıfırlandı.`);
        }
        else if (commandName === 'oto-mod') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Sadece yöneticiler kullanabilir.', flags: MessageFlags.Ephemeral });
            const durum = interaction.options.getString('durum') === 'acik';
            ayar.otoMod = durum;
            verileriKaydet();
            await interaction.reply(`🛡️ Oto-Moderasyon koruması **${durum ? 'AÇIK' : 'KAPALI'}** konuma getirildi.`);
        }
        else if (commandName === 'gunluk') {
            const simdi = Date.now();
            const sonAlim = db.gunlukData.get(interaction.user.id) || 0;
            if (simdi - sonAlim < 86400000) return interaction.reply({ content: '⏳ Günlük ödülünü zaten aldın! 24 saat sonra tekrar dene.', flags: MessageFlags.Ephemeral });

            const odul = Number(ayar.gunlukOdul) || 250;
            db.gunlukData.set(interaction.user.id, simdi);
            const yeniBakiye = bakiyeEkle(interaction.user.id, odul);
            verileriKaydet();
            await interaction.reply(`🎁 Günlük **${odul} KingMoney** ödülün hesabına eklendi! (Güncel Bakiye: **${yeniBakiye} KingMoney**)`);
        }
        else if (commandName === 'siralama') {
            const sirali = Array.from(db.kingMoneyData.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (sirali.length === 0) return interaction.reply('📉 Henüz kimse KingMoney kazanmamış.');
            const madalyalar = ['🥇', '🥈', '🥉'];
            const listeMetni = sirali.map(([id, km], idx) => {
                const ikon = madalyalar[idx] || `**${idx + 1}.**`;
                const xpVeri = db.xpData.get(id) || { level: 1 };
                return `${ikon} <@${id}> ➔ **${km} KingMoney** *(Seviye ${xpVeri.level})*`;
            }).join('\n');
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 Sunucu KingMoney Zenginler Tablosu').setDescription(listeMetni).setTimestamp()] });
        }
        else if (commandName === 'market') {
            const marketEmbed = new EmbedBuilder()
                .setColor('#9b59b6')
                .setTitle('🛒 Sunucu KingMoney Mağazası')
                .setDescription('Biriktirdiğin KingMoney ile `/satin-al` komutunu kullanarak aşağıdaki özel ödülleri alabilirsin:\n\n' +
                    '💎 **VIP Üye Rolü** ➔ `500 KingMoney` *(Kod: vip)*\n' +
                    '👑 **Sunucu Şampiyonu Rolü** ➔ `1500 KingMoney` *(Kod: sampiyon)*\n' +
                    '✏️ **Özel Takma Ad Değişimi** ➔ `250 KingMoney` *(Kod: takma-ad)*');
            await interaction.reply({ embeds: [marketEmbed] });
        }
        else if (commandName === 'satin-al') {
            const urun = interaction.options.getString('urun');
            const yeniIsim = interaction.options.getString('yeni-isim');
            const mevcutBakiye = getBakiye(interaction.user.id);

            if (urun === 'vip') {
                if (mevcutBakiye < 500) return interaction.reply({ content: `❌ Yetersiz KingMoney!`, flags: MessageFlags.Ephemeral });
                setBakiye(interaction.user.id, mevcutBakiye - 500);
                verileriKaydet();
                let rol = interaction.guild.roles.cache.find(r => r.name === '💎 VIP Üye');
                if (!rol) rol = await interaction.guild.roles.create({ name: '💎 VIP Üye', color: '#e91e63' }).catch(() => null);
                if (rol) await interaction.member.roles.add(rol).catch(() => {});
                return interaction.reply('🎉 Tebrikler! **💎 VIP Üye** rolünü satın aldın!');
            }
            else if (urun === 'sampiyon') {
                if (mevcutBakiye < 1500) return interaction.reply({ content: `❌ Yetersiz KingMoney!`, flags: MessageFlags.Ephemeral });
                setBakiye(interaction.user.id, mevcutBakiye - 1500);
                verileriKaydet();
                let rol = interaction.guild.roles.cache.find(r => r.name === '👑 Sunucu Şampiyonu');
                if (!rol) rol = await interaction.guild.roles.create({ name: '👑 Sunucu Şampiyonu', color: '#ff9800' }).catch(() => null);
                if (rol) await interaction.member.roles.add(rol).catch(() => {});
                return interaction.reply('🎉 Efsane! **👑 Sunucu Şampiyonu** rolünü satın aldın!');
            }
            else if (urun === 'takma-ad') {
                if (!yeniIsim || mevcutBakiye < 250) return interaction.reply({ content: '❌ Geçerli bir isim ve en az 250 KingMoney gerekli!', flags: MessageFlags.Ephemeral });
                try {
                    await interaction.member.setNickname(yeniIsim);
                    setBakiye(interaction.user.id, mevcutBakiye - 250);
                    verileriKaydet();
                    return interaction.reply(`✅ Takma adın **${yeniIsim}** olarak güncellendi!`);
                } catch {
                    return interaction.reply({ content: '❌ Yetkim takma adını değiştirmeye yetmiyor.', flags: MessageFlags.Ephemeral });
                }
            }
        }
        else if (commandName === 'gonder') {
            const alici = interaction.options.getUser('kullanici');
            const miktar = interaction.options.getInteger('miktar');
            if (alici.bot || alici.id === interaction.user.id || miktar <= 0) return interaction.reply({ content: '❌ Geçersiz işlem.', flags: MessageFlags.Ephemeral });
            const gonderenBakiye = getBakiye(interaction.user.id);
            if (gonderenBakiye < miktar) return interaction.reply({ content: `❌ Yetersiz KingMoney!`, flags: MessageFlags.Ephemeral });
            setBakiye(interaction.user.id, gonderenBakiye - miktar);
            bakiyeEkle(alici.id, miktar);
            verileriKaydet();
            await interaction.reply(`💸 ${interaction.user}, ${alici} adlı kullanıcıya **${miktar} KingMoney** gönderdi!`);
        }
        else if (commandName === 'duello') {
            const rakip = interaction.options.getUser('rakip');
            const miktar = interaction.options.getInteger('miktar');
            if (rakip.bot || rakip.id === interaction.user.id || miktar <= 0) return interaction.reply({ content: '❌ Geçersiz rakip veya miktar.', flags: MessageFlags.Ephemeral });
            if (getBakiye(interaction.user.id) < miktar || getBakiye(rakip.id) < miktar) return interaction.reply({ content: '❌ Taraflardan birinin bakiyesi yetersiz!', flags: MessageFlags.Ephemeral });

            const duelloEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('⚔️ YAZI-TURA KINGMONEY DÜELLOSU!')
                .setDescription(`${interaction.user}, ${rakip} adlı oyuncuya **${miktar} KingMoney** değerinde düello meydan okuması gönderdi!`);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('duello_kabul').setLabel('Kabul Et ⚔️').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('duello_red').setLabel('Reddet ❌').setStyle(ButtonStyle.Danger)
            );
            const msg = await interaction.reply({ content: `${rakip}`, embeds: [duelloEmbed], components: [row], fetchReply: true });
            aktifDuellolar.set(msg.id, { meydanOkuyanId: interaction.user.id, rakipId: rakip.id, miktar, baslangic: Date.now() });
        }
        else if (commandName === 'zar') {
            await interaction.reply(`🎲 Zar: **${Math.floor(Math.random() * 6) + 1}**`);
        }
        else if (commandName === 'yazi-tura') {
            await interaction.reply(`🪙 Sonuç: **${Math.random() < 0.5 ? 'Yazı' : 'Tura'}**`);
        }
        else if (commandName === 'espri') {
            const espiriler = ["Geçen gün taksi çevirdim, hala dönüyor!", "Adamın biri gülmüş, salçalı sürmüş.", "Sakal bıraktım, şimdi yolunu gözlüyorum."];
            await interaction.reply(`😄 ${espiriler[Math.floor(Math.random() * espiriler.length)]}`);
        }
        else if (commandName === 'kelime-oyunu-baslat') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const ilkKelime = interaction.options.getString('ilk-kelime').toLowerCase().trim();
            aktifKelimeOyunlari.set(interaction.channel.id, { kelime: ilkKelime, sonYazanId: interaction.user.id });
            await interaction.reply(`🎮 Kelime türetmece başladı! İlk kelime: **${ilkKelime}**`);
        }
        else if (commandName === 'sayi-oyunu-baslat') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            aktifSayiOyunlari.set(interaction.channel.id, { sonrakiSayi: 1, sonYazanId: null });
            await interaction.reply(`🔢 Sayı saymaca başladı! İlk sayı: **1**`);
        }
        else if (commandName === 'adam-asmaca') {
            const yedekHavuz = ['bilgisayar', 'teknoloji', 'yazilim', 'istanbul', 'galaksi', 'macera'];
            const kaynak = adamAsmacaHavuzu.length > 0 ? adamAsmacaHavuzu : yedekHavuz;
            const secilenKelime = kaynak[Math.floor(Math.random() * kaynak.length)];
            aktifAdamAsmaca.set(interaction.channel.id, { kelime: secilenKelime, tahminEdilenler: new Set(), kalanHak: 6 });
            await interaction.reply(`🎮 **Adam Asmaca Başladı!** (${secilenKelime.length} harfli)\n\`${'_ '.repeat(secilenKelime.length).trim()}\``);
        }
        else if (commandName === 'bayrak-oyunu') {
            const secilen = bayrakHavuzu[Math.floor(Math.random() * bayrakHavuzu.length)];
            aktifBayrakOyunu.set(interaction.channel.id, secilen);
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#3498db').setTitle('🚩 BU HANGİ ÜLKENİN BAYRAĞI?').setDescription(`# ${secilen.bayrak}`)] });
        }
        else if (commandName === 'hizli-yazi') {
            const cumle = hizliYaziCumleleri[Math.floor(Math.random() * hizliYaziCumleleri.length)];
            aktifHizliYazi.set(interaction.channel.id, { cumle });
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#e67e22').setTitle('⚡ HIZLI YAZMA YARIŞMASI!').setDescription(`> **${cumle.split('').join('\u200B')}**`)] });
        }
        else if (commandName === 'dc') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dc_dogruluk').setLabel('Doğruluk 😇').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('dc_cesaret').setLabel('Cesaret 🔥').setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#9b59b6').setTitle('🎭 Doğruluk mu, Cesaretlik mi?')], components: [row] });
        }
        else if (commandName === 'gunun-sorusu') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const secilen = gununSorulari[Math.floor(Math.random() * gununSorulari.length)];
            aktifGununSorulari.set(interaction.channel.id, { soru: secilen.soru, cevaplar: secilen.cevaplar, aktif: true });
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('💡 GÜNÜN BİLGİ SORUSU!').setDescription(`> **${secilen.soru}**`)] });
        }
        else if (commandName === 'itiraf') {
            const metin = interaction.options.getString('mesaj');
            const hedefKanal = interaction.guild.channels.cache.find(ch => ch.name.toLowerCase().includes('itiraf')) || interaction.channel;
            await hedefKanal.send({ embeds: [new EmbedBuilder().setColor('#34495e').setTitle('🕵️ Anonim İtiraf').setDescription(`> *"${metin}"*`).setTimestamp()] });
            await interaction.reply({ content: `✅ İtirafın ${hedefKanal} kanalına gönderildi!`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'oneri') {
            const metin = interaction.options.getString('mesaj');
            const hedefKanal = interaction.guild.channels.cache.find(ch => ch.name.toLowerCase().includes('oneri') || ch.name.toLowerCase().includes('öneri')) || interaction.channel;
            const msg = await hedefKanal.send({ embeds: [new EmbedBuilder().setColor('#1abc9c').setTitle('💡 Yeni Sunucu Önerisi').setDescription(`> **${metin}**`).setTimestamp()] });
            await msg.react('👍');
            await msg.react('👎');
            await interaction.reply({ content: `✅ Önerin ${hedefKanal} kanalına gönderildi!`, flags: MessageFlags.Ephemeral });
        }
        else if (commandName === 'afk') {
            const sebep = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
            db.afkData.set(interaction.user.id, { sebep, zaman: Date.now() });
            verileriKaydet();
            await interaction.reply(`💤 **${interaction.user.tag}** AFK moduna geçti. Sebep: **${sebep}**`);
        }
        else if (commandName === 'hatirlat') {
            const dakika = interaction.options.getInteger('dakika');
            const mesaj = interaction.options.getString('mesaj');
            await interaction.reply({ content: `⏰ **${dakika} dakika** sonra hatırlatacağım.`, flags: MessageFlags.Ephemeral });
            setTimeout(() => interaction.channel.send(`⏰ ${interaction.user}, **Hatırlatma:** ${mesaj}`).catch(() => {}), dakika * 60 * 1000);
        }
        else if (commandName === 'anket') {
            const soru = interaction.options.getString('soru');
            const secenek1 = interaction.options.getString('secenek1');
            const secenek2 = interaction.options.getString('secenek2');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('poll_opt1').setLabel(secenek1).setStyle(ButtonStyle.Primary).setEmoji('1️⃣'),
                new ButtonBuilder().setCustomId('poll_opt2').setLabel(secenek2).setStyle(ButtonStyle.Secondary).setEmoji('2️⃣')
            );
            const mesaj = await interaction.reply({
                embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('📊 İnteraktif Anket').setDescription(`> **${soru}**\n\n1️⃣ **${secenek1}** ➔ **0** oy\n2️⃣ **${secenek2}** ➔ **0** oy`)],
                components: [row],
                fetchReply: true
            });
            aktifAnketler.set(mesaj.id, { soru, secenek1, secenek2, votes1: new Set(), votes2: new Set() });
        }
        else if (commandName === 'cekilis') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const odul = interaction.options.getString('odul');
            const sure = interaction.options.getInteger('sure');
            const bitisZamani = Date.now() + sure * 60 * 1000;
            const mesaj = await interaction.reply({
                embeds: [new EmbedBuilder().setColor('#9b59b6').setTitle('🎉 ÇEKİLİŞ BAŞLADI!').setDescription(`Ödül: **${odul}**\nBitiş: <t:${Math.floor(bitisZamani / 1000)}:R>`)],
                fetchReply: true
            });
            await mesaj.react('✅');
            const yeniCekilis = { mesajId: mesaj.id, kanalId: interaction.channel.id, odul, bitisZamani };
            db.aktifCekilisler.push(yeniCekilis);
            verileriKaydet();
            cekilisiZamanla(yeniCekilis);
        }
        else if (commandName === 'duyuru') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });
            const metin = interaction.options.getString('mesaj');
            await interaction.reply({ content: '✅ Duyuru gönderildi.', flags: MessageFlags.Ephemeral });
            await interaction.channel.send({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('📢 Duyuru').setDescription(metin).setTimestamp()] });
        }
    } catch (err) {
        console.error('Interaction Hatası:', err);
    }
});

// --- PROFESYONEL ÇOKLU SUNUCU WEB DASHBOARD & GÜVENLİ API ---
const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

function oturumDogrula(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const oturum = aktifOturumlar.get(token);

    if (!oturum || oturum.expiresAt < Date.now()) {
        return res.status(401).json({ hata: 'Oturum süresi dolmuş veya geçersiz. Lütfen tekrar giriş yapın.' });
    }
    req.oturum = oturum;
    next();
}

function yetkiKontrol(userId, guildId) {
    const hedefGuildId = guildId || DEFAULT_GUILD_ID;
    const guild = client.guilds.cache.get(hedefGuildId);
    if (!guild) return null;
    const member = guild.members.cache.get(userId);
    const yetkiliMi = member && member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!yetkiliMi && userId !== GELISTIRICI_ID) return null;
    return { guild, kullaniciAdi: member ? member.user.tag : 'Geliştirici' };
}

// 1. Discord OAuth2 Giriş & Callback (Dinamik URL ve Session Token Üretimi)
app.get('/auth/discord', (req, res) => {
    const dinamikOrigin = req.query.redirect || `${req.protocol}://${req.get('host')}`;
    const url = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds&state=${encodeURIComponent(dinamikOrigin)}`;
    res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    const frontendUrl = state || `${req.protocol}://${req.get('host')}`;
    if (!code) return res.redirect(frontendUrl);

    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: client.user.id,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.redirect(frontendUrl);

        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const user = await userRes.json();
        const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const sessionToken = crypto.randomBytes(32).toString('hex');
        aktifOturumlar.set(sessionToken, {
            userId: user.id,
            username: user.username,
            avatar,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000
        });

        logEkle(DEFAULT_GUILD_ID, 'PANEL', 'Panele Giriş Yapıldı', 'Güvenli OAuth2 oturumu başlatıldı', user.username);
        res.redirect(`${frontendUrl}?token=${sessionToken}&id=${user.id}&username=${encodeURIComponent(user.username)}&avatar=${encodeURIComponent(avatar)}`);
    } catch (err) {
        console.error('OAuth2 Hatası:', err);
        res.redirect(frontendUrl);
    }
});

// 2. Kullanıcının Yönetici Olduğu Sunucuları Listeleme
app.get('/api/sunucular', oturumDogrula, (req, res) => {
    const userId = req.oturum.userId;
    const sunucular = [];
    client.guilds.cache.forEach(g => {
        const m = g.members.cache.get(userId);
        if ((m && m.permissions.has(PermissionsBitField.Flags.Administrator)) || userId === GELISTIRICI_ID) {
            sunucular.push({
                id: g.id,
                name: g.name,
                icon: g.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
            });
        }
    });
    res.json({ sunucular });
});

// 3. Seçili Sunucunun Tüm Verilerini Çekme
app.get('/api/panel/:guildId', oturumDogrula, async (req, res) => {
    const guildId = req.params.guildId || DEFAULT_GUILD_ID;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Bu sunucuda Yönetici yetkin bulunmuyor!' });
    const { guild } = yetki;

    await guild.members.fetch().catch(() => {});

    const metinKanallari = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && !ticketKanaliMi(c)).map(c => ({ id: c.id, name: c.name }));
    const kategoriler = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({ id: c.id, name: c.name }));
    const roller = guild.roles.cache.filter(r => r.name !== '@everyone' && !r.managed).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name }));

    const uyeler = guild.members.cache.filter(m => !m.user.bot).map(m => ({
        id: m.id,
        username: m.user.username,
        displayName: m.displayName,
        avatar: m.user.displayAvatarURL({ size: 64 }),
        roller: m.roles.cache.filter(r => r.name !== '@everyone').map(r => ({ id: r.id, name: r.name }))
    }));

    const zenginler = Array.from(db.kingMoneyData.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, km]) => {
        const u = guild.members.cache.get(id);
        return { id, isim: u ? u.user.username : id, km };
    });

    res.json({
        guildId: guild.id,
        sunucuAdi: guild.name,
        sunucuIkon: guild.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
        uyeSayisi: guild.memberCount,
        kanalSayisi: guild.channels.cache.size,
        rolSayisi: guild.roles.cache.size,
        ping: client.ws.ping,
        uptime: Math.floor(client.uptime / 60000),
        ayarlar: getGuildAyarlar(guild.id),
        ozelKomutlar: getGuildKomutlar(guild.id),
        kapatilanBiletler: getGuildBiletler(guild.id),
        kanallar: metinKanallari,
        kategoriler,
        roller,
        uyeler,
        zenginler,
        logs: getGuildLogs(guild.id)
    });
});

// 4. Ayarlar Kaydetme
app.post('/api/ayarlar', oturumDogrula, (req, res) => {
    const { guildId, yeniAyarlar, aciklama } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });

    db.guildAyarlar[yetki.guild.id] = { ...getGuildAyarlar(yetki.guild.id), ...yeniAyarlar };
    verileriKaydet();
    logEkle(yetki.guild.id, 'PANEL', 'Ayarlar Güncellendi', aciklama || 'Sistem yapılandırması değiştirildi', yetki.kullaniciAdi);
    res.json({ basarili: true });
});

// 5. Özel Komutlar Kaydetme
app.post('/api/komutlar', oturumDogrula, (req, res) => {
    const { guildId, komutlar, aciklama } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });

    db.guildKomutlar[yetki.guild.id] = komutlar;
    verileriKaydet();
    logEkle(yetki.guild.id, 'PANEL', 'Özel Komut Güncellendi', aciklama || 'Özel komut listesi düzenlendi', yetki.kullaniciAdi);
    res.json({ basarili: true });
});

// 6. Panik Modu
app.post('/api/panik', oturumDogrula, async (req, res) => {
    const { guildId, durum } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });

    const everyoneRol = yetki.guild.roles.everyone;
    const metinKanallari = yetki.guild.channels.cache.filter(c => c.type === ChannelType.GuildText && !ticketKanaliMi(c));

    for (const [, kanal] of metinKanallari) {
        await kanal.permissionOverwrites.edit(everyoneRol, { SendMessages: durum ? false : null }).catch(() => {});
    }

    const ayar = getGuildAyarlar(yetki.guild.id);
    ayar.panikModu = Boolean(durum);
    verileriKaydet();
    logEkle(yetki.guild.id, 'MODERASYON', durum ? '🚨 PANİK MODU AKTİF' : '✅ Panik Modu Kapatıldı', durum ? 'Tüm metin kanalları kilitlendi!' : 'Kanalların kilidi açıldı.', yetki.kullaniciAdi);
    res.json({ basarili: true });
});

// 7. Üye İşlemleri (CRM)
app.post('/api/uye/islem', oturumDogrula, async (req, res) => {
    const { guildId, hedefId, islem, rolId, sebep } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });

    const member = yetki.guild.members.cache.get(hedefId);
    if (!member) return res.status(404).json({ hata: 'Üye bulunamadı.' });

    try {
        if (islem === 'timeout') {
            await member.timeout(10 * 60 * 1000, sebep || 'Panelden susturuldu');
            logEkle(yetki.guild.id, 'MODERASYON', 'Üye Susturuldu (10 Dk)', `${member.user.tag} susturuldu. Sebep: ${sebep || '-'}`, yetki.kullaniciAdi);
        } else if (islem === 'kick') {
            await member.kick(sebep || 'Panelden atıldı');
            logEkle(yetki.guild.id, 'MODERASYON', 'Üye Atıldı', `${member.user.tag} atıldı. Sebep: ${sebep || '-'}`, yetki.kullaniciAdi);
        } else if (islem === 'ban') {
            await member.ban({ reason: sebep || 'Panelden yasaklandı' });
            logEkle(yetki.guild.id, 'MODERASYON', 'Üye Yasaklandı', `${member.user.tag} yasaklandı. Sebep: ${sebep || '-'}`, yetki.kullaniciAdi);
        } else if (islem === 'rol_ekle') {
            const rol = yetki.guild.roles.cache.get(rolId);
            if (rol) { await member.roles.add(rol); logEkle(yetki.guild.id, 'ROL', 'Üyeye Rol Verildi', `${member.user.tag} ➔ @${rol.name}`, yetki.kullaniciAdi); }
        } else if (islem === 'rol_cikar') {
            const rol = yetki.guild.roles.cache.get(rolId);
            if (rol) { await member.roles.remove(rol); logEkle(yetki.guild.id, 'ROL', 'Üyeden Rol Alındı', `${member.user.tag} ➔ @${rol.name}`, yetki.kullaniciAdi); }
        }
        res.json({ basarili: true });
    } catch {
        res.status(400).json({ hata: 'Botun yetkisi bu üyeye işlem yapmaya yetmiyor!' });
    }
});

// 8. Butonlu Rol Menüsü Gönderme
app.post('/api/rol-buton-kur', oturumDogrula, async (req, res) => {
    const { guildId, kanalId, baslik, aciklama, butonlar } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });

    const kanal = yetki.guild.channels.cache.get(kanalId);
    if (!kanal) return res.status(404).json({ hata: 'Kanal bulunamadı.' });

    const embed = new EmbedBuilder().setColor('#5865F2').setTitle(baslik || '🎭 Rol Seçim Menüsü').setDescription(aciklama || 'Butonlara tıklayarak rol alabilirsiniz.');
    const row = new ActionRowBuilder();
    butonlar.slice(0, 5).forEach(b => {
        row.addComponents(new ButtonBuilder().setCustomId(`selfrole_${b.rolId}`).setLabel(b.etiket).setStyle(ButtonStyle.Secondary));
    });

    await kanal.send({ embeds: [embed], components: [row] });
    logEkle(yetki.guild.id, 'ROL', 'Rol Menüsü Kuruldu', `#${kanal.name} kanalına gönderildi`, yetki.kullaniciAdi);
    res.json({ basarili: true });
});

// 9. Duyuru Gönderme
app.post('/api/duyuru', oturumDogrula, async (req, res) => {
    const { guildId, kanalId, baslik, mesaj, renk, gorselUrl, herkesiEtiketle } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });

    const kanal = yetki.guild.channels.cache.get(kanalId);
    if (!kanal) return res.status(404).json({ hata: 'Kanal bulunamadı.' });

    const embed = new EmbedBuilder().setColor(renk || '#5865F2').setDescription(mesaj).setTimestamp();
    if (baslik) embed.setTitle(baslik);
    if (gorselUrl && gorselUrl.startsWith('http')) embed.setImage(gorselUrl);

    await kanal.send({ content: herkesiEtiketle ? '@everyone' : undefined, embeds: [embed] });
    logEkle(yetki.guild.id, 'PANEL', 'Duyuru Yayınlandı', `#${kanal.name} kanalına duyuru atıldı`, yetki.kullaniciAdi);
    res.json({ basarili: true });
});

// 10. Ticket Paneli Gönderme
app.post('/api/ticket-kur', oturumDogrula, async (req, res) => {
    const { guildId, kanalId, baslik, aciklama } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });

    const kanal = yetki.guild.channels.cache.get(kanalId);
    if (!kanal) return res.status(404).json({ hata: 'Kanal bulunamadı.' });

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(baslik || '🎫 Destek & Yardım Merkezi')
        .setDescription(aciklama || 'Yetkili ekibimizle iletişime geçmek için aşağıdaki butona tıklayarak kategori seçip destek talebi oluşturabilirsiniz.');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_olustur').setLabel('Destek Talebi Oluştur').setEmoji('📩').setStyle(ButtonStyle.Primary)
    );

    await kanal.send({ embeds: [embed], components: [row] });
    logEkle(yetki.guild.id, 'TICKET', 'Ticket Paneli Kuruldu', `#${kanal.name} kanalına destek butonu gönderildi`, yetki.kullaniciAdi);
    res.json({ basarili: true });
});

// 11. Ekonomi & Log Temizleme
app.post('/api/ekonomi/duzenle', oturumDogrula, (req, res) => {
    const { guildId, hedefId, miktar } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });
    db.kingMoneyData.set(hedefId, Number(miktar));
    verileriKaydet();
    logEkle(yetki.guild.id, 'EKONOMI', 'Bakiye Güncellendi', `ID (${hedefId}) bakiyesi ${miktar} KM yapıldı`, yetki.kullaniciAdi);
    res.json({ basarili: true });
});

app.post('/api/logs/temizle', oturumDogrula, (req, res) => {
    const { guildId } = req.body;
    const yetki = yetkiKontrol(req.oturum.userId, guildId);
    if (!yetki) return res.status(403).json({ hata: 'Yetkisiz işlem!' });
    db.guildLogs[yetki.guild.id] = [];
    logEkle(yetki.guild.id, 'PANEL', 'Log Geçmişi Temizlendi', 'Tüm eski denetim kayıtları silindi', yetki.kullaniciAdi);
    res.json({ basarili: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 KingBot Pro SaaS Dashboard API ${PORT} portunda aktif!`));

client.login(TOKEN);