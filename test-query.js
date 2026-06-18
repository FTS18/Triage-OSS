const q = `org:microsoft org:google language:typescript language:javascript is:open is:issue`;
fetch('https://api.github.com/search/issues?q=' + encodeURIComponent(q), {
    headers: { 'Accept': 'application/vnd.github.v3+json' }
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2)));
