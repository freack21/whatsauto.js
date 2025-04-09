# WhatsAuto.js - Easy WhatsApp Automation

An easy-to-use library for creating WhatsApp Automation App.

Stand above [Baileys](https://github.com/WhiskeySockets/Baileys) Library. This library will be lightweight library for WhatsApp. Not require Selenium or any other browser.

## 🚀 Installation

Install package using npm

```
npm i whatsauto.js@latest
```

Then import the library

```ts
import AutoWA from "whatsauto.js";
```

or

```ts
const { default: AutoWA } = require("whatsauto.js");
```

## 🗒️ Insight

WhatsAuto.js is designed to simplify the process of automating WhatsApp tasks. By leveraging the power of the Baileys library, it provides a robust and efficient way to interact with WhatsApp without the need for browser automation tools like Selenium.

This makes it a lightweight and efficient solution for developers looking to integrate WhatsApp functionalities into their applications.

Additionally, WhatsAuto.js uses the Object-Oriented Programming (OOP) paradigm, making it an excellent choice for developers who prefer or are accustomed to OOP. This approach enhances code reusability, scalability, and maintainability, which are essential for long-term project development.

## 🪧 Examples

### Make WA Session / Client

```ts
import AutoWA from "../dist";

// using QR (default)
const autoWA = new AutoWA("session_name", { printQR: true });
// or
const autoWA = new AutoWA("session_name");
// or, using pair code (experimental)
const autoWA = new AutoWA("session_name", { phoneNumber: "628xxxx" });
```

> See full session parameters [here](#session-parameters)

```ts
// listen to some event
const ev = autoWA.event;

ev.onConnected(() => {
  console.log("Client Ready!");
});

ev.onMessage(async (msg) => {
  console.log(msg.text);
});

// initialize session
await autoWA.initialize();
```

### Session Parameters

```ts
{
  /**
   * Print logs into Terminal
   */
  logging?: boolean; // true, false
  /**
   * Print QR Code into Terminal
   */
  printQR?: boolean; // true, false
  /**
   * Phone number for session with pairing code
   */
  phoneNumber?: string; // 62822xxxxx (62 is your country code)
}
```

## 🧾 Disclaimer

This library is for educational and research purposes only. Use it responsibly and at your own risk.
