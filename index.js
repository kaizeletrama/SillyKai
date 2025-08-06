import { extension_settings } from "../../../extensions.js";

const extensionName = "SillyKai";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true // default toggle state
};

// Shared function for applying name coloring
function applyNameColoring(html, namesColor) {
    // Match names at the beginning of the paragraph
    html = html.replace(/^(\s*)([^:<>"]+)(:)/i, `$1<span data-sillykai-name="true" style="color: ${namesColor};">$2$3</span>`);
    
    // Match names after <br> tags (case insensitive for both <br> and <BR>)
    html = html.replace(/(<br\s*\/?>)(\s*)([^:<>"]+)(:)/gi, `$1$2<span data-sillykai-name="true" style="color: ${namesColor};">$3$4</span>`);

    return html;
}

// Get current colors from settings
function getCurrentColors() {
    return {
        textColor: extension_settings[extensionName].messageTextColor || '#ffffff',
        namesColor: extension_settings[extensionName].messageNamesColor || '#CFCFC5',
        quotesColor: extension_settings[extensionName].messageQuotesColor || '#87CEEB'
    };
}

// Load settings and initialize toggle
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    await waitForElement('#autoquote-toggle');
    await waitForElement('#asterisk-toggle');
    await waitForElement('#message-colors-toggle');
    await waitForElement('#message-text-color');
    await waitForElement('#message-names-color');
    await waitForElement('#message-quotes-color');

    // Default settings for toggles
    if (typeof extension_settings[extensionName].asteriskEnabled === 'undefined') {
        extension_settings[extensionName].asteriskEnabled = $('#asterisk-toggle').is(':checked');
    }
    if (typeof extension_settings[extensionName].messageColorsEnabled === 'undefined') {
        extension_settings[extensionName].messageColorsEnabled = $('#message-colors-toggle').is(':checked');
    }
    if (typeof extension_settings[extensionName].messageTextColor === 'undefined') {
        extension_settings[extensionName].messageTextColor = '#ffffff';
    }
    if (typeof extension_settings[extensionName].messageNamesColor === 'undefined') {
        extension_settings[extensionName].messageNamesColor = '#CFCFC5';
    }
    if (typeof extension_settings[extensionName].messageQuotesColor === 'undefined') {
        extension_settings[extensionName].messageQuotesColor = '#87CEEB';
    }

    // Restore toggle states
    $('#autoquote-toggle').prop('checked', extension_settings[extensionName].enabled);
    $('#asterisk-toggle').prop('checked', extension_settings[extensionName].asteriskEnabled);
    $('#message-colors-toggle').prop('checked', extension_settings[extensionName].messageColorsEnabled);
    
    // Set up the Tool Cool Color Pickers with debouncing
    // Wait for Tool Cool Color Picker to be fully loaded
    await new Promise(resolve => setTimeout(resolve, 200));
    
    setupColorPicker('message-text-color', 'messageTextColor', () => {
        if (extension_settings[extensionName].messageColorsEnabled) {
            applyMessageColorsToExistingMessages();
        }
    });
    
    setupColorPicker('message-names-color', 'messageNamesColor', () => {
        if (extension_settings[extensionName].messageColorsEnabled) {
            applyMessageColorsToExistingMessages();
        }
    });
    
    setupColorPicker('message-quotes-color', 'messageQuotesColor', () => {
        if (extension_settings[extensionName].messageColorsEnabled) {
            applyMessageColorsToExistingMessages();
        }
    });

    // Save toggle states on change
    $('#autoquote-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].enabled = isEnabled;
        toastr.info(`AutoQuote ${isEnabled ? "enabled" : "disabled"}`);
    });

    $('#asterisk-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].asteriskEnabled = isEnabled;
    });

    $('#message-colors-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].messageColorsEnabled = isEnabled;
        
        // Immediately apply/remove colors
        if (isEnabled) {
            applyMessageColorsToExistingMessages();
            setupMessageColorsObserver();
        } else {
            removeMessageColorsFromExistingMessages();
            if (messageColorsObserver) {
                messageColorsObserver.disconnect();
                messageColorsObserver = null;
            }
        }
    });
}

// Setup color picker with debouncing
function setupColorPicker(id, settingKey, onChangeCallback) {
    const colorPicker = document.getElementById(id);
    if (colorPicker) {
        colorPicker.color = extension_settings[extensionName][settingKey];
        
        let colorChangeTimeout;
        colorPicker.addEventListener('change', (evt) => {
            clearTimeout(colorChangeTimeout);
            colorChangeTimeout = setTimeout(() => {
                const color = evt.detail.hex;
                extension_settings[extensionName][settingKey] = color;
                onChangeCallback();
            }, 50);
        });
    }
}

// Wait for a specific DOM element to exist using MutationObserver
function waitForElement(selector) {
    return new Promise((resolve) => {
        if ($(selector).length > 0) {
            resolve();
            return;
        }
        
        const observer = new MutationObserver(() => {
            if ($(selector).length > 0) {
                observer.disconnect();
                resolve();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

function modifyLine(inputLine){
    inputLine = inputLine.replaceAll("\"", "");
    let arr = inputLine.split("*");
    let output = "";
    let inside = false;
    
    for (let chunk of arr) {
        if (!inside) {
            let trimmed = chunk.trim();
            if (trimmed) {
                trimmed = '\"' + trimmed + '\"';
            }
            let leadingSpaces = chunk.slice(0, chunk.length - chunk.trimStart().length);
            output += (leadingSpaces + trimmed);
            
            let remainingSpaces = chunk.slice(chunk.trimEnd().length, chunk.length);
            output += remainingSpaces;
            
            inside = true;
        } else {
            chunk = '*' + chunk + '*';
            output += chunk;
            inside = false;
        }
    }
    // Remove asterisks if the Asterisk toggle is off
    const asteriskEnabled = extension_settings[extensionName].asteriskEnabled;
    if (!asteriskEnabled) {
        output = output.replaceAll('*', '');
    }
    return output+"\n"
}

// Apply message colors to existing messages
function applyMessageColorsToExistingMessages() {
    if (!extension_settings[extensionName].messageColorsEnabled) {
        return;
    }
    
    const { textColor, namesColor, quotesColor } = getCurrentColors();
    const paragraphs = $('.mes_text p');
    
    paragraphs.each(function() {
        const $p = $(this);
        
        // Apply text color to the whole paragraph first
        $p.css('color', textColor).attr('data-sillykai-styled', 'true');
        
        // Color existing <q> elements (quotes)
        $p.find('q').css('color', quotesColor).attr('data-sillykai-quote', 'true');
        
        // Handle name coloring
        let html = $p.html();
        const originalHtml = html;
        html = applyNameColoring(html, namesColor);
        
        if (html !== originalHtml) {
            $p.html(html);
        }
    });
}

// Remove message colors from existing messages
function removeMessageColorsFromExistingMessages() {
    $('.mes_text p[data-sillykai-styled]').each(function() {
        const $p = $(this);
        
        // Remove name spans and restore original text
        $p.find('span[data-sillykai-name]').each(function() {
            const $el = $(this);
            $el.replaceWith($el.html());
        });
        
        // Remove quote styling but keep <q> elements
        $p.find('q[data-sillykai-quote]').removeAttr('data-sillykai-quote').removeAttr('style');
        
        // Remove paragraph styling
        $p.removeAttr('data-sillykai-styled').removeAttr('style');
    });
}

// Modify user input before saving (Only if SillyKai is enabled)
function modifyUserInput() {
    let userInput = String($('#send_textarea').val()).trim();

    // Toggle via command
    if (userInput === "//aq") {
        const currentState = extension_settings[extensionName].enabled;
        const newState = !currentState;
        extension_settings[extensionName].enabled = newState;
        $('#sillykai-toggle').prop('checked', newState);

        toastr.info(`AutoQuote ${newState ? "enabled" : "disabled"}`);

        $('#send_textarea').val('');
        return false;
    }

    if (!extension_settings[extensionName].enabled) {
        return true;
    }

    let arr = userInput.split("\n");
    let modifiedInput = "";
    for (let line of arr){
        modifiedInput += modifyLine(line);
    }
    modifiedInput = modifiedInput.trim();
    $('#send_textarea').val(modifiedInput);

    return true;
}

// Message colors observer logic
let messageColorsObserver = null;
function setupMessageColorsObserver() {
    if (messageColorsObserver) {
        messageColorsObserver.disconnect();
        messageColorsObserver = null;
    }
    if (!extension_settings[extensionName].messageColorsEnabled) return;
    
    const { textColor, namesColor, quotesColor } = getCurrentColors();
    
    messageColorsObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (!(node instanceof HTMLElement)) return;
                const targets = node.matches?.('.mes_text p') ? [node] : node.querySelectorAll?.('.mes_text p');
                if (!targets) return;
                targets.forEach(p => {
                    const $p = $(p);
                    
                    // Apply text color to the whole paragraph
                    $p.css('color', textColor).attr('data-sillykai-styled', 'true');
                    
                    // Color existing <q> elements (quotes)
                    $p.find('q').css('color', quotesColor).attr('data-sillykai-quote', 'true');
                    
                    // Handle name coloring
                    let html = p.innerHTML;
                    html = applyNameColoring(html, namesColor);
                    p.innerHTML = html;
                });
            });
        });
    });
    messageColorsObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Hook into the send button and textarea
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);

    await loadSettings();

    $("#send_but").on("click", function (e) {
        const shouldSend = modifyUserInput();
        if (!shouldSend) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    $("#send_textarea").on("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
            const shouldSend = modifyUserInput();
            if (!shouldSend) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        }
    });

    // Initial setup
    setupMessageColorsObserver();
    
    // Apply message colors to existing messages on load
    if (extension_settings[extensionName].messageColorsEnabled) {
        applyMessageColorsToExistingMessages();
    }
});


