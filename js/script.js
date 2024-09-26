const Aside = document.querySelector('.aside');
const asideToggler = document.querySelectorAll('.nav-link.aside-toggler');

console.log(asideToggler)
asideToggler.forEach((toggler)=>{
    toggler.addEventListener('click', () => {
        Aside.classList.toggle('hidden');
        console.log("toggled")
    })
   
})
