<!--
Created by Its-Just-Nans - https://github.com/Its-Just-Nans
Copyright Its-Just-Nans
--->

# Python

## How to print the error name

```python
try:
    #code here
except Exception as exception:
    print(type(exception).__name__)
    print(exception.__class__.__name__)
    print(exception.__class__.__qualname__)
```

Reference : [stackOverflow](https://stackoverflow.com/questions/18176602/how-to-get-the-name-of-an-exception-that-was-caught-in-python)

## How to get the KeyboardInterrupt

```python
try:
    #code here
except KeyboardInterrupt:
    pass
    #or do something
```
