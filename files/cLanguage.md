<!--
Created by Its-Just-Nans - https://github.com/Its-Just-Nans
Copyright Its-Just-Nans
--->

# C Language

## Understand C pointer with examples

The program used :

```c
#include <stdio.h>

int main(){
    int number = 7;
    int *pointerTOnumber = &number;
    printf("%%d number = %d\n", number);
    printf("%%p number = %p\n", number);
    printf("%%d &number = %d\n", &number);
    printf("%%p &number = %p\n", &number);
    printf("%%d pointerTOnumber = %d\n", pointerTOnumber);
    printf("%%p pointerTOnumber = %p\n", pointerTOnumber);
    printf("%%d &pointerTOnumber = %d\n", &pointerTOnumber);
    printf("%%p &pointerTOnumber = %p\n", &pointerTOnumber);
    printf("%%d *pointerTOnumber = %d\n", *pointerTOnumber);
    printf("%%p *pointerTOnumber = %p\n", *pointerTOnumber);
}
```

> Notez que `%%` est utilisé pour afficher que `%`

Le résultat :

```c
%d number = 7                            //valeur de number sous forme décimale
%p number = 0x7                          //valeur de number sous forme Hexa car %p
%d &number = -1104070188                 //valeur de l'adresse de number sous forme décimale
%p &number = 0x7ffdbe3139d4              //valeur de l'adresse sous forme hexa car %p
%d pointerTOnumber = -1104070188         //valeur de l'adresse de number sous forme décimale
%p pointerTOnumber = 0x7ffdbe3139d4      //valeur de l'adresse de number sous forme hexa car %p
%d &pointerTOnumber = -1104070184        //valeur de l'adresse du pointeur sous forme décimale
%p &pointerTOnumber = 0x7ffdbe3139d8     //valeur de l'adresse du pointeur sous forme hexa car %p
%d *pointerTOnumber = 7                  //valeur pointée par le pointeur (donc celle de number) sous forme décimale
%p *pointerTOnumber = 0x7                //valeur pointée par le pointeur (donc celle de number) sous forme hexa car %p
```

> On peut donc lire "**`l'adresse de`**" pour le symbole `&`
>
> On peut donc lire "**`la valeur pointée par`**" pour le symbole `*`

---

## Paramètre de main en C

`argv[0]` contiendra tout le temps le nom du programme

```c
int main(int argc, char *argv[]){
    for(int o=0; o < argc; o++){
        printf("Argument %d : %s\n", o, argv[o]);
    }
    return 0;
}
```

---
