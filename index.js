require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require("discord.js");
const { Pool } = require("pg");

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname,"..","data.json"),"utf8"));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined
});
const client = new Client({intents:[GatewayIntentBits.Guilds]});
const pending = new Map();

const now = () => new Date();
const dateText = () => now().toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"2-digit"});
const fmt = n => Number(n||0).toLocaleString("en-US");
const rand = max => Math.floor(Math.random()*max);
const choose = arr => arr[rand(arr.length)];
const rarity = key => DATA.rarities.find(r=>r.key===key);
const chibi = name => DATA.chibis.find(c=>c.name.toLowerCase()===String(name).toLowerCase());

async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players(
      user_id TEXT PRIMARY KEY, username TEXT NOT NULL, started_at TIMESTAMPTZ DEFAULT NOW(),
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE IF NOT EXISTS clans(
      id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, leader_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admins(user_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS server_events(
      guild_id TEXT PRIMARY KEY, multiplier NUMERIC NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    );
  `);
}
function freshPlayer(username){
  return {username,level:1,exp:0,points:0,dice:10,spray:0,clover:0,collection:[],team:[null,null,null],equipped:null,clan:null,bestRoll:null,bestChibi:null,lastDrop:0,rank:"Rookie",battlesWon:0,battlesLost:0};
}
async function getPlayer(user){
  const q=await pool.query("SELECT data FROM players WHERE user_id=$1",[user.id]);
  if(!q.rowCount) return null;
  return q.rows[0].data;
}
async function savePlayer(user,data){
  data.username=user.username;
  await pool.query(`INSERT INTO players(user_id,username,data) VALUES($1,$2,$3)
    ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username,data=EXCLUDED.data`,
    [user.id,user.username,JSON.stringify(data)]);
}
async function requirePlayer(interaction){
  const p=await getPlayer(interaction.user);
  if(!p){await interaction.reply({content:"You need to use **/start** first. Use **/help** for commands.",ephemeral:true});return null;}
  return p;
}
function rarityRoll(multiplier=1){
  const tiers=DATA.rarities;
  // Luck boosts higher tiers progressively; 1x preserves the configured weights.
  const weighted=tiers.map((r,i)=>({...r,rolledWeight:r.weight*Math.pow(Math.max(1,multiplier),i)}));
  const total=weighted.reduce((s,r)=>s+r.rolledWeight,0);
  let n=Math.random()*total;
  for(const r of weighted){n-=r.rolledWeight;if(n<=0)return r;}
  return tiers[0];
}
function doRoll(p, luck=1){
  const tier=rarityRoll(luck);
  const c=choose(DATA.chibis.filter(x=>x.rarity===tier.key));
  const shiny=Math.random() < DATA.settings.shinyChance;
  const id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const entry={id,name:c.name,rarity:c.rarity,emoji:c.emoji,shiny,level:1,exp:0,rolledAt:now().toISOString()};
  p.collection.push(entry);
  const displayOdds=rarity(c.rarity);
  const score=DATA.rarities.findIndex(x=>x.key===c.rarity);
  if(!p.bestChibi || score>DATA.rarities.findIndex(x=>x.key===p.bestChibi.rarity) || (score===DATA.rarities.findIndex(x=>x.key===p.bestChibi.rarity)&&shiny&&!p.bestChibi.shiny)) p.bestChibi={name:c.name,rarity:c.rarity,emoji:c.emoji,shiny};
  p.bestRoll=`1 in ${Math.max(1,Math.round(100/(tier.weight/ DATA.rarities.reduce((s,r)=>s+r.weight,0)*100)))}`;
  p.points += Math.max(1, (score+1)*10) + (shiny?100:0);
  p.rank = rankFor(p.points);
  return {entry,tier:displayOdds};
}
function rankFor(points){
  if(points>=100000)return "Astral";
  if(points>=50000)return "Celestial";
  if(points>=20000)return "Mythic";
  if(points>=7500)return "Diamond";
  if(points>=2500)return "Platinum";
  if(points>=500)return "Gold";
  if(points>=100)return "Silver";
  return "Rookie";
}
function statsFor(entry){
  const base=DATA.stats[entry.rarity][entry.shiny?"shiny":"normal"];
  const lv=entry.level-1;
  return {hp:base.hp+base.hpPer*lv,atk:base.atk+base.atkPer*lv,def:base.def+base.defPer*lv};
}
function expNeed(type,entry){
  if(type==="user")return DATA.settings.userExpBase+(entry.level-1)*DATA.settings.userExpPerLevel;
  return (entry.shiny?DATA.settings.shinyChibiExpBase:DATA.settings.normalChibiExpBase)+(entry.level-1)*(entry.shiny?DATA.settings.shinyChibiExpPerLevel:DATA.settings.normalChibiExpPerLevel);
}
function addUserExp(p,amount){
  p.exp+=amount;
  let gained=0;
  while(p.exp>=expNeed("user",{level:p.level})){p.exp-=expNeed("user",{level:p.level});p.level++;gained++;}
  return gained;
}
function embed(title,description,color=0x5865F2){
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({text:"Chibi RPG • RNG Adventure"}).setTimestamp();
}
async function isAdmin(id){
  if(id===process.env.OWNER_ID)return true;
  const q=await pool.query("SELECT 1 FROM admins WHERE user_id=$1",[id]);
  return !!q.rowCount;
}
async function addChibiExp(p,entry,amount){
  entry.exp+=amount;
  let levels=0;
  while(entry.exp>=expNeed("chibi",entry)){entry.exp-=expNeed("chibi",entry);entry.level++;levels++;}
  return levels;
}
function getActive(p){return p.team.find(Boolean) || p.collection.find(x=>x.id===p.equipped) || null;}
function battlePower(entry){const s=statsFor(entry);return s.hp/10+s.atk*2+s.def*1.5;}
function safeName(s){return s.replace(/[^a-z0-9 _-]/gi,"").trim().slice(0,24);}
async function updateClanPoints(clanId){
  const q=await pool.query("SELECT COALESCE(SUM((data->>'points')::bigint),0) AS pts FROM players WHERE data->>'clan'=$1",[String(clanId)]);
  return Number(q.rows[0].pts||0);
}

client.once(Events.ClientReady, c=>console.log(`Ready as ${c.user.tag}`));
client.on(Events.InteractionCreate, async interaction=>{
 try{
  if(interaction.isChatInputCommand()){
   const cmd=interaction.commandName;
   if(cmd==="help"){
    const e=embed("🎎 Chibi RPG • Command Guide",
      "**Start:** `/start` • `/profile` • `/help`\n**RNG:** `/roll quantity` • `/cdrop`\n**Collection:** `/collections` • `/cinventory` • `/cequip` • `/cequipteam` • `/cstats`\n**Progress:** `/cprofile` • `/leaderboard`\n**Social:** `/cbattle` • `/ctrade` • `/clanlist` • `/createclan` • `/cclanjoin` • `/cclaninfo`\n**Extras:** `/cshop` • `/ctrivia` • `/cmeme`\n\nUse `/start` once to create your account. Admin commands are permission-restricted.");
    return interaction.reply({embeds:[e],ephemeral:true});
   }
   if(cmd==="start"){
    if(await getPlayer(interaction.user))return interaction.reply({content:"Your Chibi RPG profile already exists. Welcome back!",ephemeral:true});
    const p=freshPlayer(interaction.user.username);await savePlayer(interaction.user,p);
    return interaction.reply({embeds:[embed("🌟 Welcome to Chibi RPG!",`Your adventure has begun, ${interaction.user}!\nYou received **10 🎲 dice** to start. Use **/roll** to discover your first Chibi.`)]});
   }
   if(cmd==="admin-give-permission"){
    if(interaction.user.id!==process.env.OWNER_ID)return interaction.reply({content:"Only the configured bot owner can grant bot-admin access.",ephemeral:true});
    const u=interaction.options.getUser("user"), enabled=interaction.options.getBoolean("enabled");
    if(enabled)await pool.query("INSERT INTO admins(user_id) VALUES($1) ON CONFLICT DO NOTHING",[u.id]);else await pool.query("DELETE FROM admins WHERE user_id=$1",[u.id]);
    return interaction.reply({content:`Bot admin access ${enabled?"granted to":"revoked from"} ${u}.`,ephemeral:true});
   }
   if(cmd.startsWith("admin-") && !(await isAdmin(interaction.user.id)))return interaction.reply({content:"You are not authorized to use this admin command.",ephemeral:true});
   if(cmd==="admin-give-item"){
    const u=interaction.options.getUser("user"),item=interaction.options.getString("item"),amount=interaction.options.getInteger("amount");
    let p=await getPlayer(u);if(!p)return interaction.reply({content:"That user has not started. They must use /start first.",ephemeral:true});
    p[item]+=amount;await savePlayer(u,p);return interaction.reply({content:`Gave ${fmt(amount)} ${item} to ${u}.`,ephemeral:true});
   }
   if(cmd==="admin-luck-event"){
    const mult=interaction.options.getNumber("multiplier");
    await pool.query(`INSERT INTO server_events(guild_id,multiplier,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour') ON CONFLICT(guild_id) DO UPDATE SET multiplier=$2,expires_at=NOW()+INTERVAL '1 hour'`,[interaction.guildId,mult]);
    return interaction.reply({content:`🍀 Server luck event enabled at **${mult}x** for 1 hour.`,ephemeral:true});
   }
   const p=await requirePlayer(interaction);if(!p)return;
   if(cmd==="roll"){
    const qty=interaction.options.getInteger("quantity")||1;
    if(p.dice<qty)return interaction.reply({content:`You need ${qty} dice but only have ${p.dice}. Use /cdrop or /cshop.`,ephemeral:true});
    p.dice-=qty;
    let mult=1;
    if(interaction.guildId){
      const ev=await pool.query("SELECT multiplier FROM server_events WHERE guild_id=$1 AND expires_at>NOW()",[interaction.guildId]);
      if(ev.rowCount)mult=Number(ev.rows[0].multiplier);
    }
    const results=[];
    for(let i=0;i<qty;i++){
      const result=doRoll(p,mult);
      if(p.spray>0){p.spray--; if(Math.random()<0.02){result.entry.rarity="SR";result.entry.name="Pem";result.entry.emoji=chibi("Pem").emoji;result.tier=rarity("SR");}}
      if(p.clover>0){p.clover--;if(Math.random()<0.02){const copy={...result.entry,id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,rolledAt:now().toISOString()};p.collection.push(copy);}}
      results.push(result);
    }
    addUserExp(p,qty*10);
    for(const teamId of p.team.filter(Boolean)){
      const teamChibi=p.collection.find(x=>x.id===teamId);
      if(teamChibi) await addChibiExp(p,teamChibi,qty*5);
    }
    await savePlayer(interaction.user,p);
    const lines=results.slice(0,25).map((r,i)=>`${i+1}. ${r.entry.shiny?DATA.chibis[0]&&"<:shiny:1571311476239630517> ":""}${r.entry.emoji} **${r.entry.name}** — ${r.tier.emoji} ${r.tier.key}${r.entry.shiny?" • SHINY":""}`).join("\n");
    const shinyCount=results.filter(r=>r.entry.shiny).length;
    return interaction.reply({embeds:[embed(`🎲 Chibi Roll ×${qty}`,`${lines}\n\n**Shiny:** ${shinyCount} • **Dice left:** ${p.dice}\n**Points:** ${fmt(p.points)}`)]});
   }
   if(cmd==="cdrop"){
    const wait=DATA.settings.dropCooldownSeconds*1000-(Date.now()-p.lastDrop);
    if(wait>0)return interaction.reply({content:`Your next drop is ready in **${Math.ceil(wait/1000)}s**.`,ephemeral:true});
    const total=DATA.dropTable.reduce((s,x)=>s+x.weight,0);let n=Math.random()*total,drop=DATA.dropTable[0];
    for(const d of DATA.dropTable){n-=d.weight;if(n<=0){drop=d;break;}}
    p.dice+=drop.dice;p.lastDrop=Date.now();await savePlayer(interaction.user,p);
    return interaction.reply({embeds:[embed(`${drop.emoji} ${drop.name}`,`You received **${drop.dice} 🎲 dice**!\nYour balance: **${p.dice} 🎲**`)]});
   }
   if(cmd==="cinventory"){
    const counts={};for(const x of p.collection)counts[x.name]=(counts[x.name]||0)+1;
    return interaction.reply({embeds:[embed("🎒 Inventory",`**Dice:** ${p.dice}\n**Spray:** ${p.spray}\n**Clover:** ${p.clover}\n**Chibis:** ${p.collection.length}\n${Object.entries(counts).map(([n,c])=>`• ${n} ×${c}`).join("\n")||"No Chibis yet."}`)],ephemeral:true});
   }
   if(cmd==="collections"){
    const page=p.collection.slice(-20).reverse();
    return interaction.reply({embeds:[embed("📚 Chibi Collection",page.map((x,i)=>`**${p.collection.length-i}.** ${rarity(x.rarity).emoji} ${x.emoji} **${x.name}** ${x.shiny?"<:shiny:1571311476239630517>":""} • Lv.${x.level} • ${new Date(x.rolledAt).toLocaleDateString("en-PH")}`).join("\n")||"Your collection is empty.")],ephemeral:true});
   }
   if(cmd==="cequip"){
    const n=interaction.options.getInteger("number");const entry=p.collection[n-1];
    if(!entry)return interaction.reply({content:"That collection number does not exist. See /collections.",ephemeral:true});
    p.equipped=entry.id;await savePlayer(interaction.user,p);
    return interaction.reply({content:`Equipped ${entry.emoji} **${entry.name}**. Now use /cequipteam to place it in a team slot.`});
   }
   if(cmd==="cequipteam"){
    const slot=interaction.options.getInteger("slot")-1;const entry=p.collection.find(x=>x.id===p.equipped);
    if(!entry)return interaction.reply({content:"Equip a Chibi first using /cequip.",ephemeral:true});
    p.team[slot]=entry.id;await savePlayer(interaction.user,p);
    return interaction.reply({content:`${entry.emoji} **${entry.name}** is now in team slot ${slot+1}.`});
   }
   if(cmd==="cstats"){
    const entry=getActive(p);if(!entry)return interaction.reply({content:"You have no equipped Chibi. Use /cequip first.",ephemeral:true});
    const s=statsFor(entry),need=expNeed("chibi",entry);
    return interaction.reply({embeds:[embed(`${entry.shiny?"✨ SHINY ":""}${entry.emoji} ${entry.name} • Lv.${entry.level}`,`❤️ HP: **${fmt(s.hp)}**\n🗡️ ATK: **${fmt(s.atk)}**\n🛡️ DEF: **${fmt(s.def)}**\nEXP: **${fmt(entry.exp)}/${fmt(need)}**\nRarity: **${entry.rarity}**`)]});
   }
   if(cmd==="cprofile"){
    const user=interaction.options.getUser("user")||interaction.user;const target=await getPlayer(user);
    if(!target)return interaction.reply({content:"That player has not started Chibi RPG.",ephemeral:true});
    const best=target.bestChibi?`${target.bestChibi.emoji} ${target.bestChibi.name}${target.bestChibi.shiny?" ✨":""}`:"None";
    return interaction.reply({embeds:[embed(`👤 ${user.username}'s Profile`,`📊 Level: **${target.level}** (${fmt(target.exp)}/${fmt(expNeed("user",{level:target.level}))} EXP)\n🎲 Dice: **${target.dice}**\n🏆 Best Roll: **${target.bestRoll||"None"}**\n${best}\n🏅 Rank: **${target.rank}** • **${fmt(target.points)} points**\n🔰 Clan: **${target.clan||"None"}**`)]});
   }
   if(cmd==="cshop"){
    const e=embed("🛍️ Chibi Shop","**🧴 Spray — 5 🎲**\nUse: next 30 rolls receive a 2% chance to upgrade a result to an SR Chibi.\n\n**🍀 Clover — 15 🎲**\nUse: next 50 rolls receive a 2% chance to duplicate a Chibi.\n\nUse the buttons below to purchase.");
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("buy_spray").setLabel("Buy Spray • 5 dice").setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId("buy_clover").setLabel("Buy Clover • 15 dice").setStyle(ButtonStyle.Success));
    return interaction.reply({embeds:[e],components:[row],ephemeral:true});
   }
   if(cmd==="cbattle"){
    const opponent=interaction.options.getUser("opponent");
    if(opponent.bot||opponent.id===interaction.user.id)return interaction.reply({content:"Choose another human player.",ephemeral:true});
    const a=getActive(p),b=await getPlayer(opponent);
    if(!a)return interaction.reply({content:"Equip a Chibi first.",ephemeral:true});
    if(!b||!getActive(b))return interaction.reply({content:"Your opponent needs /start and an equipped Chibi.",ephemeral:true});
    const id=`battle_${interaction.id}`;pending.set(id,{type:"battle",from:interaction.user.id,to:opponent.id,a:a.id,b:getActive(b).id,expires:Date.now()+120000});
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${id}_accept`).setLabel("Accept Battle").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`${id}_decline`).setLabel("Decline").setStyle(ButtonStyle.Danger));
    return interaction.reply({content:`${opponent}, ${interaction.user} challenges you to a Chibi battle!`,components:[row]});
   }
   if(cmd==="ctrade"){
    const user=interaction.options.getUser("user");
    if(user.bot||user.id===interaction.user.id)return interaction.reply({content:"Choose another human player.",ephemeral:true});
    const other=await getPlayer(user);if(!other)return interaction.reply({content:"That player needs to use /start first.",ephemeral:true});
    const id=`trade_${interaction.id}`;pending.set(id,{type:"trade",from:interaction.user.id,to:user.id,stage:0,offer:[],want:[],expires:Date.now()+300000});
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${id}_accept`).setLabel("Open Trade").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`${id}_decline`).setLabel("Cancel").setStyle(ButtonStyle.Danger));
    return interaction.reply({content:`${user}, ${interaction.user} invited you to trade. Accept to open the trade selection flow.`,components:[row]});
   }
   if(cmd==="clanlist"){
    const q=await pool.query("SELECT name,leader_id FROM clans ORDER BY name LIMIT 25");
    return interaction.reply({embeds:[embed("🔰 Available Clans",q.rows.map((x,i)=>`${i+1}. **${x.name}** • Leader <@${x.leader_id}>`).join("\n")||"No clans yet.")],ephemeral:true});
   }
   if(cmd==="createclan"){
    if(p.clan)return interaction.reply({content:"Leave your current clan before creating another.",ephemeral:true});
    const name=safeName(interaction.options.getString("name"));
    if(name.length<3)return interaction.reply({content:"Clan name must contain at least 3 valid characters.",ephemeral:true});
    try{const q=await pool.query("INSERT INTO clans(name,leader_id) VALUES($1,$2) RETURNING id",[name,interaction.user.id]);p.clan=String(q.rows[0].id);await savePlayer(interaction.user,p);return interaction.reply({content:`🔰 Clan **${name}** created! You are the Leader.`});}
    catch{return interaction.reply({content:"That clan name is already taken.",ephemeral:true});}
   }
   if(cmd==="cclanjoin"){
    if(p.clan)return interaction.reply({content:"You are already in a clan.",ephemeral:true});
    const name=interaction.options.getString("name");
    const q=await pool.query("SELECT id,name FROM clans WHERE LOWER(name)=LOWER($1)",[name]);
    if(!q.rowCount)return interaction.reply({content:"Clan not found. Check /clanlist.",ephemeral:true});
    p.clan=String(q.rows[0].id);await savePlayer(interaction.user,p);return interaction.reply({content:`You joined clan **${q.rows[0].name}**.`});
   }
   if(cmd==="cclaninfo"){
    if(!p.clan)return interaction.reply({content:"You are not in a clan.",ephemeral:true});
    const q=await pool.query("SELECT * FROM clans WHERE id=$1",[p.clan]);if(!q.rowCount)return interaction.reply({content:"Clan data not found.",ephemeral:true});
    const members=await pool.query("SELECT user_id,username,data FROM players WHERE data->>'clan'=$1",[p.clan]);
    const pts=members.rows.reduce((s,x)=>s+Number(x.data.points||0),0);
    const lines=members.rows.sort((a,b)=>Number(b.data.points||0)-Number(a.data.points||0)).slice(0,20).map((x,i)=>`${i+1}. <@${x.user_id}> ${x.user_id===q.rows[0].leader_id?"**Leader**":"Member"} • ${x.data.rank||"Rookie"} • ${fmt(x.data.points)} pts • ${x.data.bestRoll||"—"}`).join("\n");
    return interaction.reply({embeds:[embed(`🔰 ${q.rows[0].name}`,`**Clan Leader:** <@${q.rows[0].leader_id}>\n**Total Clan Points:** ${fmt(pts)}\n**Members:** ${members.rowCount}\n\n${lines}`)]});
   }
   if(cmd==="botstatus"){
    const q=await pool.query("SELECT COUNT(*)::int AS players FROM players");
    return interaction.reply({embeds:[embed("🤖 Chibi RPG Bot Status",`**Servers:** ${client.guilds.cache.size}\n**Registered players:** ${fmt(q.rows[0].players)}\n**Commands:** Active\n**Database:** Connected`)]});
   }
   if(cmd==="leaderboard"){
    const q=await pool.query("SELECT user_id,username,data FROM players ORDER BY (data->>'points')::bigint DESC LIMIT 10");
    return interaction.reply({embeds:[embed("🏆 Points Leaderboard",q.rows.map((x,i)=>`${i+1}. **${x.username}** — ${fmt(x.data.points)} pts • ${x.data.rank}`).join("\n")||"No players yet.") ]});
   }
   if(cmd==="ctrivia"){
    const questions=[
      {q:"Which Chibi rarity comes after Common?",a:"uncommon"},
      {q:"How many team slots can you equip?",a:"3"},
      {q:"What command claims a dice drop?",a:"/cdrop"},
      {q:"Which item can duplicate a Chibi?",a:"clover"}
    ];
    const item=choose(questions);
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("trivia_hint").setLabel("Show answer").setStyle(ButtonStyle.Secondary));
    pending.set(`trivia_${interaction.id}`,{answer:item.a,user:interaction.user.id});
    return interaction.reply({content:`🧠 **Trivia:** ${item.q}\nReply with your answer in chat. (For this starter release, answer checking is handled by the Show answer button.)`,components:[row],ephemeral:true});
   }
   if(cmd==="cmeme"){
    return interaction.reply({content:"😂 Meme generator is not connected to a third-party image source in this starter build. Add a trusted meme API URL in a future update; no external site is scraped." ,ephemeral:true});
   }
  }
  if(interaction.isButton()){
    const id=interaction.customId;
    if(id==="trivia_hint"){
      const item=[...pending.entries()].find(([k,v])=>k.startsWith("trivia_")&&v.user===interaction.user.id);
      return interaction.reply({content:item?`Answer: **${item[1].answer}**`:"Trivia session expired.",ephemeral:true});
    }
    if(id.startsWith("buy_")){
      const p=await requirePlayer(interaction);if(!p)return;
      const item=id.slice(4),cost=item==="spray"?5:15;
      if(p.dice<cost)return interaction.reply({content:"Not enough dice.",ephemeral:true});
      p.dice-=cost;p[item]++;await savePlayer(interaction.user,p);
      return interaction.reply({content:`Purchased 1 ${item}. Balance: ${p.dice} dice.`,ephemeral:true});
    }
    const match=id.match(/^(battle|trade)_([^_]+)_(accept|decline)$/);
    if(match){
      const key=`${match[1]}_${match[2]}`,action=match[3],session=pending.get(key);
      if(!session||session.expires<Date.now())return interaction.reply({content:"This request has expired.",ephemeral:true});
      if(interaction.user.id!==session.to)return interaction.reply({content:"Only the invited player can respond.",ephemeral:true});
      if(action==="decline"){pending.delete(key);return interaction.update({content:"Request declined or cancelled.",components:[]});}
      if(session.type==="battle"){
        const p1=await getPlayer({id:session.from}),p2=await getPlayer({id:session.to});
        const a=p1.collection.find(x=>x.id===session.a),b=p2.collection.find(x=>x.id===session.b);
        if(!a||!b)return interaction.update({content:"A battle Chibi is no longer available.",components:[]});
        const pa=battlePower(a)*(0.9+Math.random()*0.2),pb=battlePower(b)*(0.9+Math.random()*0.2);
        const winner=pa>=pb?session.from:session.to,loser=winner===session.from?session.to:session.from;
        const wu=await client.users.fetch(winner),lu=await client.users.fetch(loser);
        const wp=winner===session.from?p1:p2,lp=loser===session.from?p1:p2;
        wp.points+=100;wp.battlesWon++;wp.rank=rankFor(wp.points);lp.battlesLost++;addUserExp(wp,100);
        await savePlayer(wu,wp);await savePlayer(lu,lp);pending.delete(key);
        return interaction.update({content:`⚔️ Battle complete!\nWinner: <@${winner}> (+100 points)\nOpponent: <@${loser}>\n${a.name} power: ${Math.round(pa)} • ${b.name} power: ${Math.round(pb)}`,components:[]});
      }
      // Trade is intentionally staged: invitation acceptance opens a safe selection prompt.
      pending.delete(key);
      return interaction.update({content:`Trade accepted! Both players should use /cinventory to review their items. The item-selection and final-confirmation UI is reserved for the next trade module update; no items have moved.`,components:[]});
    }
  }
 }catch(err){
   console.error("Interaction error:",err);
   const payload={content:"Something went wrong while processing that command. Please try again; the error has been logged.",ephemeral:true};
   if(interaction.deferred||interaction.replied)await interaction.followUp(payload).catch(()=>{});
   else await interaction.reply(payload).catch(()=>{});
 }
});

(async()=>{
 if(!process.env.DISCORD_TOKEN)throw new Error("DISCORD_TOKEN is missing.");
 if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is missing. Add Railway PostgreSQL.");
 await initDb();
 await client.login(process.env.DISCORD_TOKEN);
})().catch(err=>{console.error(err);process.exit(1);});

process.on("SIGTERM",async()=>{await pool.end();client.destroy();process.exit(0);});
