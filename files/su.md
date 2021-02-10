<!--
Created by Its-Just-Nans - https://github.com/Its-Just-Nans
Copyright Its-Just-Nans
--->


### Utilisation de `su` sur Linux (Debian)

La commande `su` permet de changer s'utilisateur pour le temps d'une session (après avoir saisi le mot de passe, s'il y en a un), pour l'utiliser, on écrit :
```sh
su UTILISATEUR
```
On peut aussi l'utiliser pour devenir root simplement en écrivant :
```sh
su
```

Pour devenir superutilisateur sur Linux, on peut faire la commande `su`. Mais parfois, cela ne suffit pas, nous n'avons toujours pas les droits, c'est normal : nous n'avons pas chargé les variables d'environnement du superutilisateur.

Pour ce faire faites simplement
```sh
su -l
#ou encore
su -
#dans ce dernier cas, s'il y a plusieurs options, il faut que le tiret soit la dernière option, avant le pseudo
```

Reference : [manpages.debian](https://manpages.debian.org/stretch/login/su.1.fr.html)
