---
title: "Introducing Birdseed"
description: "Designing a bird feeder camera that thinks for itself — no cloud, and not on an ESP32."
date: 2026-06-16
draft: false
---

I want to put a camera on my bird feeder. I also want to put one on my mom's feeder, and a couple of friends' feeders, without becoming the IT department for all of them. That second want is the whole design problem, and it's where Birdseed starts.

The first principle is no cloud. Most smart feeder cameras you can buy ship the video up to a company's servers, hand you back the results, and charge a few dollars a month for the privilege. For me that's a non-starter on principle — it's the same on-device thesis behind Audiary and MoarPixels. But it's also just the better engineering for what I want to do. The moment a device leans on someone's cloud, deploying it to my mom means accounts, an app, a subscription, and a support call when any of those break. A box that does its own thinking and serves its own little page on the home WiFi is something I can hand off and forget about. Cloudless isn't the idealistic choice here, it's the easy one.

If the device has to think for itself, the next question is what does the thinking. The obvious answer in 2026 is an ESP32. They're the new hotness in IoT for good reason — a few dollars, sips power, WiFi and Bluetooth baked in, and the ESP32-CAM even bolts a little camera onto it. For a huge range of sensors and gadgets they're exactly right.

They're just not right for this one. The job isn't to capture a frame, it's to look at the frame and decide whether there's a bird in it and which one — a real classifier, not a motion trigger. That kind of model wants more memory and compute than a microcontroller has to give. An ESP32 can run the tiny stuff — presence, a wake word, is-there-a-person — and the camera that pairs with it tops out at a small, noisy sensor. Push past that and you're right back to offloading the hard part to the cloud, which is the one thing I said I wouldn't do. The ESP32 misses the boxes precisely because it's a microcontroller, and this needs something closer to a real computer.

So: a Raspberry Pi Zero 2 W. It's about the smallest thing I know of that's still a full Linux computer — quad-core, half a gig of RAM — which is enough to run a proper camera pipeline, do the classification on-device, and host a small page showing who visited the feeder today. All of it local, all on a board that costs around fifteen dollars. It clears every box the ESP32 missed.

That capability comes at a cost, and the cost is power. A Pi will happily draw more than a microcontroller ever would, and this is a thing that has to sit outside and run more or less forever. So the discipline of the project is to keep the Pi dumb. It should idle most of its life, wake on motion, do the smallest amount of work each moment actually needs, and go back to sleep. The interesting part of Birdseed isn't making the Pi do more — it's making a capable little computer behave like a frugal one, so I get the brains of Linux at something closer to the power budget of the ESP32 I just turned down.

None of this is working yet, which is exactly why I'm writing it down now. Birdseed is a build-in-public project, and right now it's a principle (no cloud), a part (a Pi I plan to keep on a short leash), and a feeder full of birds I'd like to start counting. I'll post the wiring, the power numbers, and the first time a model confidently calls a squirrel a blue jay. If you've fought the ESP32-versus-Pi fight for something like this, I'd genuinely like to hear how it went.
