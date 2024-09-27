const Aside = document.querySelector('.aside');
const sideNav = document.querySelector('.nav-items');
const asideToggler = document.querySelectorAll('.nav-link.aside-toggler');
const mainToggler = document.querySelector('.toggler button.toggler-btn');

console.log(asideToggler)
asideToggler.forEach((toggler)=>{
    toggler.addEventListener('click', () => {
        Aside.classList.toggle('hidden');
        console.log("toggled")
    })
   
})

window.addEventListener('load',(e)=>{
    window.addEventListener('resize',()=>{
        if(window.innerWidth > 768){
            sideNav.classList.remove('hidden')
        }
        else{
            sideNav.classList.add('hidden')
        }
    })
    console.log(e)
    if(window.innerWidth < 768){
        sideNav.classList.add('hidden')
    }
})

mainToggler.addEventListener('click',()=>{
    sideNav.classList.toggle('hidden')
})