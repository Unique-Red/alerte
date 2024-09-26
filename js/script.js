const Aside = document.querySelector('.aside');
const asideToggler = document.querySelectorAll('.nav-link.aside-toggler');

console.log(asideToggler)
asideToggler.forEach((toggler)=>{
    toggler.addEventListener('click', () => {
        Aside.classList.toggle('hidden');
        console.log("toggled")
    })
})

if(!Aside.classList.contains('hidden')){
    document.addEventListener('click', (e) => {
        if(e.target !== Aside && e.target !== asideToggler){
            Aside.classList.add('hidden');
        }
    })
}
else{
    document.addEventListener('click', (e) => {
        if(e.target === asideToggler){
            Aside.classList.remove('hidden');
        }
    })
}