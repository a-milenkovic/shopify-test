// Simple copy to clipboard function
function copyToClipboard(text, button) {
    // Try modern clipboard API first
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showFeedback(button, 'Copied!');
        }).catch(() => {
            // Fallback if clipboard API fails
            fallbackCopyToClipboard(text, button);
        });
    } else {
        // Fallback for older browsers
        fallbackCopyToClipboard(text, button);
    }
}

function fallbackCopyToClipboard(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showFeedback(button, 'Copied!');
    } catch (err) {
        showFeedback(button, 'Failed to copy');
    }
    
    document.body.removeChild(textArea);
}

function showFeedback(button, message) {
    const originalText = button.textContent;
    button.textContent = message;
    button.disabled = true;
    
    setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
    }, 2000);
}