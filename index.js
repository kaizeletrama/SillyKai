import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types, updateMessageBlock, saveSettingsDebounced } from '../../../../script.js';

const extensionName = "SillyKai";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    postProcessingEnabled: false,
    // per-method postprocessing defaults
    removeThoughtsEnabled: true,
    removeCharactersEnabled: false,
    removeCharactersChars: ''
};

let messageColorsObserver = null;

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

    setupMessageColorsObserver();
    
    if (extension_settings[extensionName].messageColorsEnabled) {
        applyMessageColorsToExistingMessages();
    }

    try {
        eventSource.makeFirst(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
            try {
                if (!extension_settings[extensionName].postProcessingEnabled) return;

                const context = getContext();
                const message = context?.chat?.[messageId];
                if (!message) return;

                const messageTextEl = $(`#chat .mes[mesid="${messageId}"] .mes_text`);
                if (messageTextEl.length && messageTextEl.text().trim() === '...') return;

                const original = message.mes ?? '';
                const processed = await postProcess(original, message);

                if (typeof processed === 'string' && processed !== original) {
                    if (typeof message.extra !== 'object') message.extra = {};
                    message.mes = processed;
                    updateMessageBlock(Number(messageId), message);
                }
            } catch (err) {
                console.error('SillyKai postProcess handler error', err);
            }
        });
    } catch (err) {
        console.warn('SillyKai: could not attach postProcess handler', err);
    }
});

function modifyUserInput() {
    let userInput = String($('#send_textarea').val()).trim();

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
    
    const asteriskEnabled = extension_settings[extensionName].asteriskEnabled;
    if (!asteriskEnabled) {
        output = output.replaceAll('*', '');
    }
    return output+"\n"
}

async function postProcess(messageText, messageObj) {
    try {
        if (typeof messageText !== 'string') return messageText;
        // Only run postprocessing if globally enabled
        if (!extension_settings[extensionName].postProcessingEnabled) return messageText;

        let text = messageText;

        // removethoughts (maintains existing behavior)
        if (extension_settings[extensionName].removeThoughtsEnabled) {
            text = removethoughts(text);
        }

        // remove characters (optional)
        if (extension_settings[extensionName].removeCharactersEnabled) {
            const chars = String(extension_settings[extensionName].removeCharactersChars || '');
            text = removecharacters(text, chars);
        }

        return text;
    } catch (err) {
        console.error('SillyKai postProcess error', err);
        return messageText;
    }
}
function removethoughts(text) {
  const lines = text.split(/\r?\n/);
  let cutIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const cleaned = lines[i].replace(/^[\s\p{P}\p{S}]+/u, "");
    if (/^[\u0980-\u09FF]/u.test(cleaned)) {
      cutIndex = i;
      break;
    }
  }
  
  const removed = lines.slice(0, cutIndex).join("\n");
  
    if (cutIndex === -1){
            console.log("[removethoughts] -", removed);
            return "";
        }
    
        console.log("[removethoughts] -", removed);

  return lines.slice(cutIndex).join("\n").replace(/\*/g, "");
}

function removecharacters(text, charsCsv) {
    if (!charsCsv) return text;

    // parse comma-separated values, trim and filter empties
    const parts = charsCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return text;

    // escape regex special chars for each token
    const escaped = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // build regex to remove any occurrence of the tokens
    const pattern = new RegExp(`(${escaped.join('|')})`, 'gu');
    return String(text).replace(pattern, '');
}

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
                    
                    $p.css('color', textColor).attr('data-sillykai-styled', 'true');
                    $p.find('q').css('color', quotesColor).attr('data-sillykai-quote', 'true');
                    
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

function applyMessageColorsToExistingMessages() {
    if (!extension_settings[extensionName].messageColorsEnabled) {
        return;
    }
    
    const { textColor, namesColor, quotesColor } = getCurrentColors();
    const paragraphs = $('.mes_text p');
    
    paragraphs.each(function() {
        const $p = $(this);
        
        $p.css('color', textColor).attr('data-sillykai-styled', 'true');
        $p.find('q').css('color', quotesColor).attr('data-sillykai-quote', 'true');
        
        let html = $p.html();
        const originalHtml = html;
        html = applyNameColoring(html, namesColor);
        
        if (html !== originalHtml) {
            $p.html(html);
        }
    });
}

function removeMessageColorsFromExistingMessages() {
    $('.mes_text p[data-sillykai-styled]').each(function() {
        const $p = $(this);
        
        $p.find('span[data-sillykai-name]').each(function() {
            const $el = $(this);
            $el.replaceWith($el.html());
        });
        
        $p.find('q[data-sillykai-quote]').removeAttr('data-sillykai-quote').removeAttr('style');
        $p.removeAttr('data-sillykai-styled').removeAttr('style');
    });
}

function applyNameColoring(html, namesColor) {
    html = html.replace(/^(\s*)([^:<>"]+)(:)/i, `$1<span data-sillykai-name="true" style="color: ${namesColor};">$2$3</span>`);
    html = html.replace(/(<br\s*\/?>)(\s*)([^:<>"]+)(:)/gi, `$1$2<span data-sillykai-name="true" style="color: ${namesColor};">$3$4</span>`);
    return html;
}

function getCurrentColors() {
    return {
        textColor: extension_settings[extensionName].messageTextColor || '#ffffff',
        namesColor: extension_settings[extensionName].messageNamesColor || '#CFCFC5',
        quotesColor: extension_settings[extensionName].messageQuotesColor || '#87CEEB'
    };
}

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    await waitForElement('#autoquote-toggle');
    await waitForElement('#asterisk-toggle');
    await waitForElement('#message-colors-toggle');
    await waitForElement('#postprocessing-toggle');
    await waitForElement('#message-text-color');
    await waitForElement('#message-names-color');
    await waitForElement('#message-quotes-color');

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
    if (typeof extension_settings[extensionName].postProcessingEnabled === 'undefined') {
        extension_settings[extensionName].postProcessingEnabled = $('#postprocessing-toggle').is(':checked');
    }

    $('#autoquote-toggle').prop('checked', extension_settings[extensionName].enabled);
    $('#asterisk-toggle').prop('checked', extension_settings[extensionName].asteriskEnabled);
    $('#message-colors-toggle').prop('checked', extension_settings[extensionName].messageColorsEnabled);
    $('#postprocessing-toggle').prop('checked', extension_settings[extensionName].postProcessingEnabled);
    
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

    $('#postprocessing-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].postProcessingEnabled = isEnabled;
        saveSettingsDebounced();
    });

    // Optional per-method postprocessing UI controls (non-blocking)
    if ($('#remove-thoughts-toggle').length) {
        if (typeof extension_settings[extensionName].removeThoughtsEnabled === 'undefined') {
            extension_settings[extensionName].removeThoughtsEnabled = $('#remove-thoughts-toggle').is(':checked');
        }
        $('#remove-thoughts-toggle').prop('checked', extension_settings[extensionName].removeThoughtsEnabled);
        $('#remove-thoughts-toggle').on('change', function () {
            extension_settings[extensionName].removeThoughtsEnabled = $(this).is(':checked');
            saveSettingsDebounced();
        });
    }

    if ($('#remove-characters-toggle').length) {
        if (typeof extension_settings[extensionName].removeCharactersEnabled === 'undefined') {
            extension_settings[extensionName].removeCharactersEnabled = $('#remove-characters-toggle').is(':checked');
        }
        $('#remove-characters-toggle').prop('checked', extension_settings[extensionName].removeCharactersEnabled);
        $('#remove-characters-toggle').on('change', function () {
            extension_settings[extensionName].removeCharactersEnabled = $(this).is(':checked');
            saveSettingsDebounced();
        });
    }

    if ($('#remove-characters-chars').length) {
        if (typeof extension_settings[extensionName].removeCharactersChars === 'undefined') {
            extension_settings[extensionName].removeCharactersChars = $('#remove-characters-chars').val() || '';
        }
        $('#remove-characters-chars').val(extension_settings[extensionName].removeCharactersChars);
        $('#remove-characters-chars').on('input change', function () {
            extension_settings[extensionName].removeCharactersChars = $(this).val();
            saveSettingsDebounced();
        });
    }
}

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
