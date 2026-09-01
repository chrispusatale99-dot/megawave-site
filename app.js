const app=document.querySelector('#app');
const symbols=[
 {name:'Volatility 10 Index',symbol:'R_10'},{name:'Volatility 25 Index',symbol:'R_25'},{name:'Volatility 50 Index',symbol:'R_50'},
 {name:'Volatility 75 Index',symbol:'R_75'},{name:'Volatility 100 Index',symbol:'R_100'},{name:'Volatility 10 (1s)',symbol:'1HZ10V'},
 {name:'Volatility 25 (1s)',symbol:'1HZ25V'},{name:'Volatility 50 (1s)',symbol:'1HZ50V'},{name:'Volatility 75 (1s)',symbol:'1HZ75V'},
 {name:'Volatility 100 (1s)',symbol:'1HZ100V'}
];
const strategies=['AI Adaptive','Matches','Differs','Even','Odd','Over','Under','Rise','Fall'];
let selected=symbols[0],connected=false,bot=false,tab='trade',socket=null,scannerRunning=true,authSession=new URLSearchParams(location.search).get('session')||null,authenticated=false;
const state={prices:{},ticks:{},history:[],signals:{},balance:'--'};
symbols.forEach(s=>state.ticks[s.symbol]=[]);
function pct(n){return `${n.toFixed(1)}%`}
function lastDigit(quote){const s=String(quote); const m=s.match(/\.(\d+)/); return Number(m?m[1].slice(-1):s.slice(-1));}
function analyze(arr){
 const data=arr.slice(-200),digits=Array.from({length:10},()=>0); data.forEach(d=>digits[d]++); const total=data.length||1;
 const p=digits.map(x=>x/total*100), max=Math.max(...p), min=Math.min(...p), maxD=p.indexOf(max), minD=p.indexOf(min);
 const even=p.filter((_,i)=>i%2===0).reduce((a,b)=>a+b,0), odd=100-even;
 const recent=data.slice(-40), rp=Array.from({length:10},()=>0); recent.forEach(d=>rp[d]++); const rtotal=recent.length||1;
 const recentP=rp.map(x=>x/rtotal*100);
 const recentMax=Math.max(...recentP), recentMaxD=recentP.indexOf(recentMax);
 const streak=data.length?data.reduce((n,d)=>d===data[data.length-1]?n+1:0,0):0;
 const entropy=-p.filter(x=>x>0).reduce((sum,x)=>sum+(x/100)*Math.log2(x/100),0)/Math.log2(10);
 return {p,max,min,maxD,minD,even,odd,recentP,recentMax,recentMaxD,streak,entropy,count:data.length};
}
function predict(arr){
 const a=analyze(arr); if(a.count<20)return {strategy:'Collecting data',signal:'WAIT',confidence:0,target:'--',reason:'Need at least 20 recent ticks'};
 const digitScores=a.recentP.map((v,i)=>v-(a.p[i]||10));
 const hot=a.recentMaxD, cold=a.minD;
 const evenBias=Math.abs(a.even-50), oddBias=Math.abs(a.odd-50);
 const candidates=[];
 candidates.push({strategy:'Matches',target:String(hot),confidence:Math.min(94,50+Math.max(0,digitScores[hot])*2.8+Math.min(10,a.streak)*1.2),reason:`Digit ${hot} is ${digitScores[hot]>=0?'above':'near'} its baseline frequency`});
 candidates.push({strategy:'Differs',target:String(cold),confidence:Math.min(92,50+Math.max(0,-digitScores[cold])*2.5),reason:`Digit ${cold} is currently relatively uncommon`});
 candidates.push({strategy:a.even>=a.odd?'Even':'Odd',target:a.even>=a.odd?'Even':'Odd',confidence:Math.min(91,50+Math.max(evenBias,oddBias)*0.75),reason:`Recent parity split: ${a.even.toFixed(1)}% even / ${a.odd.toFixed(1)}% odd`});
 const overTarget=5, over=a.recentP.slice(6).reduce((x,y)=>x+y,0), under=100-over;
 candidates.push({strategy:over>=under?'Over':'Under',target:over>=under?'>5':'<5',confidence:Math.min(90,50+Math.abs(over-50)*0.6),reason:`Recent high/low digit split: ${over.toFixed(1)}% over 5`});
 candidates.push({strategy:'AI Adaptive',target:String(hot),confidence:Math.min(96,50+Math.max(0,digitScores[hot])*2+Math.abs(a.even-50)*0.35+(a.entropy<0.97?4:0)),reason:`Combines digit frequency, recent shift, parity and distribution balance`});
 candidates.sort((x,y)=>y.confidence-x.confidence);
 const best=candidates[0]; best.signal=best.confidence>=70?'FAVORABLE':best.confidence>=60?'WATCH':'AVOID'; return best;
}
function scannerRows(){
 const rows=symbols.map(s=>{const sig=predict(state.ticks[s.symbol]);state.signals[s.symbol]=sig;return `<div class="scan-row"><b>${s.name}</b><span>${sig.strategy}${sig.target!=='--'?' '+sig.target:''}</span><span class="${sig.signal==='FAVORABLE'?'sig-good':sig.signal==='AVOID'?'sig-bad':'sig-watch'}">${sig.signal}</span><span class="confidence">${sig.confidence.toFixed(0)}%</span></div>`}).join('');
 return rows;
}
function render(){
 const price=state.prices[selected.symbol]??'--', a=analyze(state.ticks[selected.symbol]);
 app.innerHTML=`<div class="app"><header class="top"><div class="logo">MEGA<span>WAVE</span></div><div class="top-actions"><div class="toggle"></div><button class="refresh" onclick="location.reload()">↻</button><div class="account">Demo Account⌄</div></div></header><main class="content">${tab==='trade'?tradeView(price,a):tab==='history'?historyView():profileView()}</main><nav class="bottom"><div class="bottom-inner"><button class="nav ${tab==='trade'?'active':''}" onclick="tab='trade';render()">◉<br>Trade</button><button class="nav ${tab==='history'?'active':''}" onclick="tab='history';render()">▥<br>History</button><button class="nav ${tab==='profile'?'active':''}" onclick="tab='profile';render()">●<br>Profile</button></div></nav></div>`;
 renderChart();
}
function tradeView(price,a){const sig=state.signals[selected.symbol]||predict(state.ticks[selected.symbol]);return `<section class="card balance"><div><div class="label">ACCOUNT BALANCE</div><div class="amount">${state.balance==='--'?'--':'$'+Number(state.balance).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div><button class="btn dark">Deposit</button></section><div class="grid2"><section class="card mini"><h3>Deposit Funds</h3><p>M-Pesa / Crypto</p></section><section class="card mini"><h3>Withdraw Funds</h3><p>Fast Processing</p></section></div><section class="card"><h3>Transaction History <span style="float:right">›</span></h3></section><div class="section-title">DERIV VOLATILITY INDICES</div><div class="markets">${symbols.map(s=>`<button class="market ${s.symbol===selected.symbol?'active':''}" onclick="selectMarket('${s.symbol}')">${s.name}</button>`).join('')}</div><section class="card"><div class="title-row"><h2>${selected.name}</h2><div class="price">${typeof price==='number'?price.toFixed(2):price}</div></div><canvas id="chart" class="chart"></canvas></section><section class="card scanner"><div class="title-row"><h2>AI Market Scanner</h2><span class="live"><i class="dot"></i>${connected?'LIVE':'CONNECTING'}</span></div><p class="muted">AI ranks markets using recent digit distribution, parity, streaks and distribution balance. It is a statistical signal, not a guarantee.</p><div class="scanner-head"><b>MARKET</b><b>BEST SETUP</b><b>SIGNAL</b><b>CONF.</b></div>${scannerRows()}</section><section class="card"><h2>AI PREDICTION</h2><div class="prediction"><div><span class="muted">Selected market</span><strong>${selected.name}</strong></div><div><span class="muted">Strategy</span><strong>${sig.strategy}</strong></div><div><span class="muted">Prediction</span><strong>${sig.target}</strong></div><div><span class="muted">Confidence</span><strong>${sig.confidence.toFixed(0)}%</strong></div><div class="reason">${sig.reason}</div></div></section><section class="card"><h2>LAST DIGIT STATS (0–9)</h2><div class="digits">${a.p.map((v,i)=>`<div class="digit ${i===a.maxD?'good':i===a.minD?'bad':''}">${i}<small>${pct(v)}</small></div>`).join('')}</div></section><section class="card"><div class="title-row"><h2>Trading Engine</h2><span class="live"><i class="dot"></i>${bot?'BOT RUNNING':'READY'}</span></div><div class="tabs"><button class="tab active">AI Bot</button><button class="tab">Manual</button></div><div class="field"><label>SELECTED MARKET</label><div class="big-value">${selected.name}</div></div><div class="field"><label>STAKE ($)</label><input id="stake" type="number" value="1" min="0.35" step="0.01"></div><div class="field"><label>STRATEGY</label><select id="strategy">${strategies.map(x=>`<option ${x===sig.strategy?'selected':''}>${x}</option>`).join('')}</select></div><div class="two"><div class="field"><label>TAKE PROFIT ($)</label><input type="number" value="10"></div><div class="field"><label>STOP LOSS ($)</label><input type="number" value="10"></div></div><div class="field"><label>MARTINGALE MULTIPLIER</label><input type="number" value="2.1" step="0.1" min="1"></div><button class="btn primary full" onclick="toggleBot()">${bot?'Stop Trading Bot':'Start Trading Bot'}</button><p class="muted small">Trading is disabled in this build until authenticated demo trading is connected and risk limits are configured.</p></section></main></div>`}
function historyView(){return `<section class="card"><h2>Trade History</h2>${state.history.length?state.history.map(x=>`<div class="history-item"><div><b>${x.market}</b><div class="muted">${x.strategy} · ${x.time}</div></div><div class="${x.pnl>=0?'profit':'loss'}">${x.pnl>=0?'+':''}$${x.pnl.toFixed(2)}</div></div>`).join(''):'<p class="muted">No trades yet. Demo history will appear here after authenticated demo execution is added.</p>'}</section>`}
function profileView(){return `<section class="card"><h2>Trading Console</h2><p class="muted">${authenticated?'Deriv authentication is active for this session.':'Authenticate through Deriv's official OAuth 2.0 + PKCE flow. MEGAWAVE never asks for your Deriv password.'}</p><button class="btn primary full" onclick="startOAuth()">${authenticated?'Reconnect via Deriv':'Authenticate via Deriv'}</button><div class="security"><b>Security</b><p class="muted">OAuth authorization is handled by Deriv. The authorization-code exchange runs on the server; tokens are not placed in frontend code.</p></div></section>`}
function toggleBot(){bot=!bot;render()}
function selectMarket(sym){selected=symbols.find(s=>s.symbol===sym)||selected;render()}
function connect(){
 socket=new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');
 socket.onopen=()=>{connected=true; socket.send(JSON.stringify({active_symbols:'brief',req_id:1})); symbols.forEach((s,i)=>socket.send(JSON.stringify({ticks:s.symbol,subscribe:1,req_id:100+i}))); render()};
 socket.onclose=()=>{connected=false;render();setTimeout(connect,3000)};
 socket.onerror=()=>{connected=false;render()};
 socket.onmessage=e=>{const d=JSON.parse(e.data);if(d.msg_type==='tick'){const sym=d.tick.symbol,q=Number(d.tick.quote);state.prices[sym]=q;state.ticks[sym].push(lastDigit(d.tick.quote));if(state.ticks[sym].length>300)state.ticks[sym].shift();state.signals[sym]=predict(state.ticks[sym]);if(tab==='trade')render()}};
}
function renderChart(){const c=document.querySelector('#chart');if(!c)return;const arr=state.ticks[selected.symbol]||[];const ctx=c.getContext('2d');const W=c.clientWidth||300,H=c.clientHeight||210;c.width=W*2;c.height=H*2;ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,W,H);if(!arr.length)return;ctx.beginPath();arr.forEach((v,i)=>{const x=i/(Math.max(1,arr.length-1))*W,y=H-(v/9)*H*.78-H*.11;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle='#6366e8';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke()}
window.selectMarket=selectMarket;window.toggleBot=toggleBot;window.render=render;connect();render();
setInterval(()=>{if(tab==='trade'){symbols.forEach(s=>state.signals[s.symbol]=predict(state.ticks[s.symbol]));render();}},2500);

window.startOAuth=()=>{location.href='/auth/start'};
async function checkAuth(){if(!authSession)return;try{const r=await fetch('/api/session?session='+encodeURIComponent(authSession));authenticated=r.ok; if(r.ok){history.replaceState({},'',location.pathname);render();}}catch(e){}}
checkAuth();
