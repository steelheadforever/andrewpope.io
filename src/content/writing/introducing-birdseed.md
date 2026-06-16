---
title: "Introducing Birdseed"
description: "A Raspberry Pi Zero 2 W, a camera module, and a feeder — teaching a tiny computer to watch the backyard."
date: 2026-06-16
draft: false
---

There's a feeder outside my kitchen window, and most mornings I lose a few minutes to it. A cardinal shows up like he owns the place. A pair of chickadees take turns. Once in a while something I can't name drops in, eats, and is gone before I've decided what it was. I spend my working hours watching the world through a lens from a long way off — and there's something quietly corrective about pointing that same instinct at a bird feeder twenty feet away. No mission. Just: who showed up today?

So I'm building Birdseed. The idea is about as simple as a project gets: a Raspberry Pi Zero 2 W, a camera module aimed at the feeder, and enough software to notice when a bird lands, take its picture, and keep a little log of who's been coming around. The name does double duty — it's a feeder project, and it's the seed of a thing I want to grow into something more capable over time.

You can buy a smart bird feeder camera off a shelf, and plenty of people happily do. But almost all of them work the same way: the camera ships your backyard up to a company's cloud, a server somewhere decides that's a finch, and you rent the result back for a monthly fee. That's the exact arrangement that bugs me, and it's the same thesis behind Audiary and MoarPixels — the computer is *right there*. My sparrows do not need to travel to a data center in Virginia to be counted. The whole point of Birdseed is that the watching, the deciding, and the remembering all happen on a fifteen-dollar board sitting on my windowsill.

Which is the part I'm actually excited about. The Pi Zero 2 W is a beautiful little study in constraint: a quad-core chip and half a gigabyte of RAM, the kind of budget that would have been a serious workstation not so long ago and is now a rounding error. Can something that small run a vision model good enough to tell a cardinal from a house finch from a leaf blowing past the lens? That's the question I keep coming back to. It's the same itch the Tiny Whoop gave me — we spend so much attention on the biggest GPUs in the world, and meanwhile there's a whole frontier of useful compute down at the tiny end, waiting for someone to bother.

There's a real stack to learn here, and that's the point. Getting a clean camera feed off the Zero's awkward little ribbon connector. A capture pipeline that triggers on motion without filling a card with a thousand pictures of an empty perch. A small, quantized classifier running locally to put a name to each visitor. And eventually a modest web page — hosted right here — where you can see who stopped by the feeder today. I don't have all of that working yet. That's exactly why I'm writing this now instead of later: Birdseed is a build-in-public project, and I'd rather show the false starts than pretend it arrived finished.

I'll post as it comes together — the wiring, the dead ends, the first time a model confidently identifies a squirrel as a blue jay. If you've done on-device vision on hardware this humble, I want to hear what you learned. For now it's a window, a feeder, and a tiny computer I'm about to teach to pay attention. We must not bury our talents — and some days that just means counting the birds.
