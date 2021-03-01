<!--
Created by Its-Just-Nans - https://github.com/Its-Just-Nans
Copyright Its-Just-Nans
--->

# FFMPEG

## Download

[ffmpeg.org](https://ffmpeg.org/)

## Useful commands

● Compress a file

```
& 'C:\Program Files\ffmpeg\bin\ffmpeg.exe' -i input.mp4 -preset veryslow OUTPUT_NAME.mp4
```
> Legend :
> - `-preset veryslow` is the level of compress, see [here](https://trac.ffmpeg.org/wiki/Encode/H.264#:~:text=ultrafast) for others presets

● Zoom in a video

```
& 'C:\Program Files\ffmpeg\bin\ffmpeg.exe' -i .\input.mp4 -vf "scale=2*iw:-1, crop=iw/2:ih/2:0:400" OUTPUT_NAME.mp4
```
> Legend :
> - `scale` enlarge the video, and `crop` cut a part
> - `crop` parameters are width:height:x:y
> - here, it is a zoom of `2`

● Cut a video


```sh
ffmpeg -ss 00:01:00 -i input.mp4 -t 00:02:00 -c copy OUTPUT_NAME.mp4
```

> - `-i` :This specifies the input file. In that case, it is (input.mp4)
> - `ss` : Used with -i, this seeks in the input file (input.mp4) to position.
> - `00:01:00` : This is the time your trimmed video will start with.
> - `t` : This specifies duration from start (00:01:40) to end (00:02:12).
> - `00:02:00` : This is the time your trimmed video will end with.
> - `c copy` : This is an option to trim via stream copy. (NB: Very fast)

[StackOverflow](https://stackoverflow.com/questions/18444194/cutting-the-videos-based-on-start-and-end-time-using-ffmpeg#:~:text=Try%20using%20this.%20It%20is%20the%20fastest%20and%20best%20ffmpeg-way%20I%20have%20figure%20it%20out:)

> - ⚠️ `-t` specifies the duration !
> - The OUTPUT_NAME need to have the same extension as the input file (or ffmpeg will need to re-encode the video)