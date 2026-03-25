(function() {
    const mesesDatos = [
        { nombre: "Enero", dias: [8, 15, 22, 29] },
        { nombre: "Febrero", dias: [5, 12, 19, 26] },
        { nombre: "Marzo", dias: [5, 12, 19, 26] },
        { nombre: "Abril", dias: [9, 16, 23, 29] },
        { nombre: "Mayo", dias: [7, 14, 21, 28] },
        { nombre: "Junio", dias: [4, 11, 18, 25] },
        { nombre: "Julio", dias: [2, 9, 16, 24] },
        { nombre: "Agosto", dias: [7, 13, 20, 27] },
        { nombre: "Setiembre", dias: [3, 10, 17, 24] },
        { nombre: "Octubre", dias: [1, 15, 22, 29] },
        { nombre: "Noviembre", dias: [5, 12, 19, 26] },
        { nombre: "Diciembre", dias: [3, 10, 17, 23] }
    ];

    const grid = document.getElementById('grid-calendario');
    if (!grid) return;

    // --- AUTOMATIZACIÓN DE FECHA ACTUAL ---
    const fechaReloj = new Date();
    const opciones = { month: 'long' };
    // Obtenemos el nombre del mes actual en español (Enero, Febrero...)
    const nombreMesActual = new Intl.DateTimeFormat('es-ES', opciones).format(fechaReloj);
    const diaHoy = fechaReloj.getDate();

    // Variable para acumular el HTML y hacer un solo render (Más rápido)
    let htmlFinal = '';

    mesesDatos.forEach(mes => {
        let diasHtml = '';
        
        mes.dias.forEach(dia => {
            // Comparamos el nombre del mes (ignorando mayúsculas/minúsculas) y el número del día
            const esHoy = (mes.nombre.toLowerCase() === nombreMesActual.toLowerCase() && dia === diaHoy) ? 'hoy' : '';
            
            diasHtml += `<div class="dia-badge ${esHoy}" title="${esHoy ? 'Hoy es día de pago' : 'Día de pago programado'}">${dia}</div>`;
        });

        htmlFinal += `
            <div class="mes-card">
                <div class="mes-header">${mes.nombre}</div>
                <div class="mes-body">
                    ${diasHtml}
                </div>
            </div>
        `;
    });

    // Renderizado único en el DOM
    grid.innerHTML = htmlFinal;

    console.log("📅 Calendario renderizado con éxito.");
})();