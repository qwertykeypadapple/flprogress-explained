# FLProgress Explained

An interactive page that explains progress-based client selection in federated learning through four small games:

1. **Be the server**: pick phones to train on, first by loss, then by measured progress.
2. **Spot the teacher**: choose which phone teaches most from its loss history.
3. **The noisy TV**: a surprise-seeking robot and a progress-seeking robot explore a room with a TV showing static.
4. **The race**: bet on a selection strategy and watch them train side by side.

The games run on a small toy simulation (`sim.js`) that keeps only the core mechanism and exaggerates the gaps. The "Real results" and "Where it fails" sections use numbers and plots from the actual experiments.

Plain HTML, CSS and JavaScript with no build step. To run locally:

```bash
python3 -m http.server 8000
```
