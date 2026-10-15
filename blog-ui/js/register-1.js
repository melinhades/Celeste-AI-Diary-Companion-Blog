    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function() {
            document.body.style.visibility = 'hidden';
            void document.body.offsetHeight;
            document.body.style.visibility = '';
        });
    }
    
