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

    $('#autoquote-toggle').prop('checked', extension_settings[extensionName].enabled);

    // Toast on manual toggle
    $('#autoquote-toggle').on('change', function () {
        const isEnabled = $(this).is(':checked');
        extension_settings[extensionName].enabled = isEnabled;
        console.debug("AutoQuote setting saved:", isEnabled);

        toastr.info(`AutoQuote ${isEnabled ? "enabled" : "disabled"}`);
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

    userInput = userInput.replaceAll("\"", "");
    let arr = userInput.split("*");
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

    $('#send_textarea').val(output);
    console.debug("Modified User Input: ", output);

    return true;
}

// Hook into the send button and textarea
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);

    await loadSettings();

    $("#send_button").on("click", function (e) {
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
});
