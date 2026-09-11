const express = require('express');
const ytDlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// 🔌 CONEXIÓN SEGURA A SUPABASE (Usando variables de entorno)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 🎵 ENDPOINT PARA TU TELÉFONO
app.post('/api/descargar-playlist', async (req, res) => {
    const { urlPlaylist, artista, contrasena } = req.body;

    // 🔒 Seguridad basada en tu variable de entorno secreta
    if (contrasena !== process.env.MOTOR_PASSWORD) {
        return res.status(403).json({ error: "No autorizado." });
    }

    // Respuesta inmediata a tu celular
    res.json({ mensaje: `Sincronización iniciada para ${artista}. ¡Ya puedes cerrar la app!` });

    try {
        const carpetaTemporal = '/tmp'; 

        await ytDlp(urlPlaylist, {
            format: 'bestaudio/best',
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: '192K',
            output: path.join(carpetaTemporal, '%(title)s.%(ext)s'),
            noOverwrites: true,
            ignoreErrors: true,
            
            exec: async (filePath) => {
                const nombreArchivo = path.basename(filePath);
                const tituloCancion = nombreArchivo.replace('.mp3', '');

                console.log(`📥 Descargado en caché temporal: ${tituloCancion}`);

                // 1️⃣ SUBIR EL ARCHIVO MP3 AL STORAGE DE SUPABASE
                const archivoBuffer = fs.readFileSync(filePath);
                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('musica')
                    .upload(nombreArchivo, archivoBuffer, {
                        contentType: 'audio/mpeg',
                        upsert: true 
                    });

                if (uploadError) {
                    console.error(`❌ Error al subir archivo a Supabase:`, uploadError.message);
                    return;
                }

                // 2️⃣ OBTENER LA URL PÚBLICA DEL MP3
                const { data: urlData } = supabase
                    .storage
                    .from('musica')
                    .getPublicUrl(nombreArchivo);
                
                const urlPublicaCompleta = urlData.publicUrl;

                // 3️⃣ REGISTRAR EL TRACK EN LA BASE DE DATOS
                const { error: dbError } = await supabase
                    .from('canciones')
                    .insert([
                        { 
                            titulo: tituloCancion, 
                            artista: artista, 
                            archivoUrl: urlPublicaCompleta 
                        }
                    ]);

                if (dbError) {
                    console.error(`❌ Error al registrar en BD:`, dbError.message);
                } else {
                    console.log(`💾 Guardado exitosamente en base de datos: ${tituloCancion}`);
                }

                // 4️⃣ LIMPIEZA
                fs.unlinkSync(filePath);
            }
        });

        console.log(`✅ ¡Todo el catálogo de ${artista} ha sido procesado!`);

    } catch (error) {
        console.error("❌ Error crítico en el motor de descargas:", error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Motor musical encendido en puerto ${PORT}`));
          
