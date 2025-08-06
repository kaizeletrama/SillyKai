import { extension_settings } from "../../../extensions.js";

const extensionName = "AutoQuote";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true // default toggle state
};

// Load settings and initialize toggle
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    await waitForElement('#autoquote-toggle');
    await waitForElement('#asterisk-toggle');
    await waitForElement('#highlight-names-toggle');
    await waitForElement('#highlight-names-color');

    // Default settings for toggles
    if (typeof extension_settings[extensionName].asteriskEnabled === 'undefined') {
        extension_settings[extensionName].asteriskEnabled = $('#asterisk-toggle').is(':checked');
    }
    if (typeof extension_settings[extensionName].highlightNamesEnabled === 'undefined') {
        extension_settings[extensionName].highlightNamesEnabled = $('#highlight-names-toggle').is(':checked');
    }
    if (typeof extension_settings[extensionName].highlightNamesColor === 'undefined') {
        extension_settings[extensionName].highlightNamesColor = '#CFCFC5';
    }

    // Restore toggle states
    $('#autoquote-toggle').prop('checked', extension_settings[extensionName].enabled);
    $('#asterisk-toggle').prop('checked', extension_settings[extensionName].asteriskEnabled);
    $('#highlight-names-toggle').prop('checked', extension_settings[extensionName].highlightNamesEnabled);
    
    // Set up the Tool Cool Color Picker
    const colorPicker = document.getElementById('highlight-names-color');
    if (colorPicker) {
        colorPicker.color = extension_settings[extensionName].highlightNamesColor;
        
        // Listen for color changes with debouncing for better performance
        let colorChangeTimeout;
        colorPicker.addEventListener('change', (evt) => {
            clearTimeout(colorChangeTimeout);
            colorChangeTimeout = setTimeout(() => {
                const color = evt.detail.hex;
                extension_settings[extensionName].highlightNamesColor = color;
                console.debug("Highlight names color saved:", color);
                
                // Apply changes immediately if highlighting is enabled
                if (extension_settings[extensionName].highlightNamesEnabled) {
                    applyHighlightingToExistingMessages();
                }
            }, 50); // Short debounce for smooth color dragging
        });
    }

    // Save toggle states on change
    $('#autoquote-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].enabled = isEnabled;
        console.debug("AutoQuote setting saved:", isEnabled);
        toastr.info(`AutoQuote ${isEnabled ? "enabled" : "disabled"}`);
    });

    $('#asterisk-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].asteriskEnabled = isEnabled;
        console.debug("Asterisk setting saved:", isEnabled);
    });

    $('#highlight-names-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].highlightNamesEnabled = isEnabled;
        console.debug("Highlight names setting saved:", isEnabled);
        
        // Immediately apply/remove highlighting
        if (isEnabled) {
            applyHighlightingToExistingMessages();
            setupHighlightNamesObserver();
        } else {
            removeHighlightingFromExistingMessages();
            if (highlightNamesObserver) {
                highlightNamesObserver.disconnect();
                highlightNamesObserver = null;
            }
        }
    });
}

// Wait for a specific DOM element to exist (helper)
function waitForElement(selector) {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if ($(selector).length > 0) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
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

// Apply highlighting to existing messages efficiently
function applyHighlightingToExistingMessages() {
    if (!extension_settings[extensionName].highlightNamesEnabled) return;
    const color = extension_settings[extensionName].highlightNamesColor || '#CFCFC5';
    
    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
        $('.mes_text p').each(function() {
            const $p = $(this);
            // Remove any existing highlighting first
            $p.find('span[data-autoquote-highlight]').each(function() {
                const $span = $(this);
                $span.replaceWith($span.text());
            });
            
            const segments = $p.html().split(/<br\s*\/?>(?![^<]*<)/i);
            const updatedSegments = segments.map(segment => {
                return segment.replace(
                    /^\s*([^:<>"\n]+?):/,
                    (match, name) => `<span data-autoquote-highlight="true" style="color: ${color};">${name}:</span>`
                );
            });
            $p.html(updatedSegments.join('<br>'));
        });
    });
}

// Remove highlighting from existing messages
function removeHighlightingFromExistingMessages() {
    requestAnimationFrame(() => {
        $('.mes_text p').each(function() {
            const $p = $(this);
            $p.find('span[data-autoquote-highlight]').each(function() {
                const $span = $(this);
                $span.replaceWith($span.text());
            });
        });
    });
}

// Modify user input before saving (Only if AutoQuote is enabled)
function modifyUserInput() {
    let userInput = String($('#send_textarea').val()).trim();

    // Toggle via command
    if (userInput === "//aq") {
        const currentState = extension_settings[extensionName].enabled;
        const newState = !currentState;
        extension_settings[extensionName].enabled = newState;
        $('#autoquote-toggle').prop('checked', newState);
        console.debug("AutoQuote toggled via //aq command:", newState);

        toastr.info(`AutoQuote ${newState ? "enabled" : "disabled"}`);

        $('#send_textarea').val('');
        return false;
    }

    if (!extension_settings[extensionName].enabled) {
        console.debug("AutoQuote is OFF. No modifications applied.");
        return true;
    }

    let arr = userInput.split("\n");
    let modifiedInput = "";
    for (let line of arr){
        modifiedInput += modifyLine(line);
    }
    modifiedInput = modifiedInput.trim();
    $('#send_textarea').val(modifiedInput);
    console.debug("Modified User Input: ", modifiedInput);

    return true;
}

// Highlight names observer logic
let highlightNamesObserver = null;
function setupHighlightNamesObserver() {
    if (highlightNamesObserver) {
        highlightNamesObserver.disconnect();
        highlightNamesObserver = null;
    }
    if (!extension_settings[extensionName].highlightNamesEnabled) return;
    const color = extension_settings[extensionName].highlightNamesColor || '#CFCFC5';
    highlightNamesObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (!(node instanceof HTMLElement)) return;
                const targets = node.matches?.('.mes_text p') ? [node] : node.querySelectorAll?.('.mes_text p');
                if (!targets) return;
                targets.forEach(p => {
                    const segments = p.innerHTML.split(/<br\s*\/?>(?![^<]*<)/i);
                    const updatedSegments = segments.map(segment => {
                        return segment.replace(
                            /^\s*([^:<>"\n]+?):/,
                            (match, name) => `<span data-autoquote-highlight="true" style="color: ${color};">${name}:</span>`
                        );
                    });
                    p.innerHTML = updatedSegments.join('<br>');
                });
            });
        });
    });
    highlightNamesObserver.observe(document.body, {
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
    setupHighlightNamesObserver();
    
    // Apply highlighting to existing messages on load
    if (extension_settings[extensionName].highlightNamesEnabled) {
        applyHighlightingToExistingMessages();
    }
});
