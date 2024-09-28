function openNav(){
    'use strict';
    const sidepanel = document.getElementById('mySidepanel');
    if(sidepanel){
        sidepanel.style.left = '0';
    } else{
        console.error('error: sidepanel not found');
    }
}

function closeNav(){
    'use strict';
    const sidepanel = document.getElementById('mySidepanel');
    if(sidepanel){
        sidepanel.style.left = '-320px';
    } else{
        console.error('error: sidepanel not found');
    }
}

function openSideNav(){
    'use strict';
    const sidepanel = document.getElementById('right_side');
    if(sidepanel){
        sidepanel.style.right = '0';
    } else{
        console.error('error: sidepanel not found');
    }
}

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