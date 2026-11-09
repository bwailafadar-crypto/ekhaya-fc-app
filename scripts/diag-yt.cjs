const UA={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36','accept-language':'en-US,en;q=0.9','cookie':'CONSENT=YES+1'}
const grab=async(u)=>{try{const r=await fetch(u,{headers:UA});return{s:r.status,t:await r.text()}}catch(e){return{s:'ERR',t:String(e)}}}
const out=(t)=>console.log(`::notice::${t}`)
;(async()=>{
  for(const h of ['https://www.youtube.com/@EkhayaFC','https://www.youtube.com/@ekhayafc','https://www.youtube.com/c/EkhayaFC','https://www.youtube.com/results?search_query=Ekhaya+FC+Malawi']){
    const {s,t}=await grab(h)
    const id=t.match(/"(?:channelId|externalId|browseId)":"(UC[\w-]{22})"/)?.[1]||t.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1]
    out(`${h} -> http ${s}, id=${id||'none'}, title=${(t.match(/<title>([^<]*)<\/title>/)?.[1]||'').slice(0,40)}`)
  }
  for(const id of ['UCn2biBqMNXorIDQLFdsNR5Q']){
    const {s,t}=await grab(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)
    out(`feed ${id} -> http ${s}, first=${t.slice(0,80).replace(/\n/g,' ')}`)
  }
})()
