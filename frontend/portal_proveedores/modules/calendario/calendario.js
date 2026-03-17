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
    
    // Hoy para marcar el día actual si coincide (Simulación)
    const mesActual = "Marzo"; 
    const diaActual = 12;

    mesesDatos.forEach(mes => {
        let diasHtml = '';
        mes.dias.forEach(dia => {
            const esHoy = (mes.nombre === mesActual && dia === diaActual) ? 'hoy' : '';
            diasHtml += `<div class="dia-badge ${esHoy}" title="Día de pago">${dia}</div>`;
        });

        grid.innerHTML += `
            <div class="mes-card">
                <div class="mes-header">${mes.nombre}</div>
                <div class="mes-body">${diasHtml}</div>
            </div>
        `;
    });
})();