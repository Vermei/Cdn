const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const expire = document.getElementById('expire');
const result = document.getElementById('result');
const urlInput = document.getElementById('url');
const list = document.getElementById('list');

['dragenter','dragover','dragleave','drop'].forEach(e=>{
  drop.addEventListener(e, ev=>{ev.preventDefault();ev.stopPropagation()});
});
['dragenter','dragover'].forEach(e=>{
  drop.addEventListener(e, ()=>drop.classList.add('drag'));
});
['dragleave','drop'].forEach(e=>{
  drop.addEventListener(e, ()=>drop.classList.remove('drag'));
});
drop.addEventListener('drop', e=>{
  const f = e.dataTransfer.files[0];
  if(f) upload(f);
});
fileInput.onchange = ()=> upload(fileInput.files[0]);

function upload(f){
  const fd = new FormData();
  fd.append('file', f);
  fd.append('expire', expire.value);
  fetch('/api/upload.php', {method:'POST', body:fd})
    .then(r=>r.json())
    .then(j=>{
      if(j.status){
        urlInput.value = j.url;
        result.classList.remove('hidden');
        loadList();
      }else{
        alert(j.message||'error');
      }
    });
}
function copy(){
  urlInput.select();
  document.execCommand('copy');
  alert('url copied');
}
function loadList(){
  fetch('/api/list.php?apikey=keyku123')
    .then(r=>r.json())
    .then(j=>{
      list.innerHTML='';
      if(j.data) j.data.forEach(i=>{
        const div=document.createElement('div');
        div.className='item';
        div.innerHTML=`<a href="${i.url}" target="_blank">${i.filename}</a> <small>${(i.size/1024).toFixed(1)}kb</small>`;
        list.appendChild(div);
      });
    });
}
loadList();
