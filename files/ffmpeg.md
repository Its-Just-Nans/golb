<!--
Created by Its-Just-Nans - https://github.com/Its-Just-Nans
Copyright Its-Just-Nans
--->

# FFMPEG

## Download

[ffmpeg.org](https://ffmpeg.org/)

## Useful commands

Compress a file

```
& 'C:\Program Files\ffmpeg\bin\ffmpeg.exe' -i input.mp4 -preset veryslow OUTPUT_NAME.mp4
```
> Legend :
> - `-preset veryslow` is the level of compress, see [here](https://trac.ffmpeg.org/wiki/Encode/H.264#:~:text=ultrafast) for others presets

Zoom in a video

```
& 'C:\Program Files\ffmpeg\bin\ffmpeg.exe' -i .\ondes.mp4 -vf "scale=2*iw:-1, crop=iw/2:ih/2:0:400" OUTPUT_NAME.mp4
```
> Legend :
> - `scale` enlarge the video, and `crop` cut a part
> - `crop` parameters are width/height/x/y
> - here, it is a zoom of `2`