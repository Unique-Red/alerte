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

function closeSideNav(){
    'use strict';
    const sidepanel = document.getElementById('right_side');
    if(sidepanel){
        sidepanel.style.right = '-355px';
    } else{
        console.error('error: sidepanel not found');
    }
}

document.getElementById("toggleCollapse").addEventListener("click", function(event) {
    event.preventDefault();  // Prevent the default anchor behavior
    var collapseElement = document.getElementById("pages");
    
    // Toggle the "show" class to collapse or expand the list
    collapseElement.classList.toggle("show");
});

// script.js

// Add interactivity for any animations or additional features if needed

// For example: Animate the CTA button or trigger smooth scrolling when "Learn More" is clicked
document.querySelector('.cta-btn').addEventListener('click', function() {
    window.scrollTo({
        top: document.querySelector('.about').offsetTop,
        behavior: 'smooth'
    });
});
