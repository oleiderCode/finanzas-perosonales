# Finanzas personales dark - versión con autoguardado

## Autoguardado

Esta versión guarda automáticamente cada cambio en el navegador mediante `localStorage`.

Eso significa:

- si cierras la app, los datos se recuperan al abrir `index.html` otra vez en el mismo navegador;
- si se apaga la laptop o cierras la pestaña, el último estado queda recuperable;
- el botón `Guardar JSON` sigue siendo necesario como respaldo físico;
- si limpias los datos del navegador, cambias de navegador o usas otra computadora, necesitas abrir tu archivo JSON guardado.

## Guardado en archivo JSON

En Chrome o Edge, después de conceder permiso de escritura, la app también intenta escribir automáticamente sobre el JSON abierto.

En otros navegadores, puede que solo funcione el autoguardado local y la descarga manual de copia.
