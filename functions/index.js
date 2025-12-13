// C:\Users\luiz\Desktop\inspetorpro\functions\index.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Inicialização do Admin SDK (usa as credenciais de serviço do Firebase)
admin.initializeApp();

// Configura o agendamento para rodar a cada 5 minutos
// (Ajuste 'every 5 minutes' se quiser uma frequência diferente, ex: 'every 10 minutes')
exports.limpezaHistoricoExpirado = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    
    // 1. Define o carimbo de tempo atual do servidor (em milissegundos).
    const agora = Date.now();
    
    // 2. Cria uma referência para o nó 'historico' (onde os dados finalizados são armazenados)
    const historicoRef = admin.database().ref('historico');

    // 3. Consulta: busca todos os itens onde dataExpiracao <= agora (itens que já expiraram)
    const snapshot = await historicoRef
        .orderByChild('dataExpiracao') // Garante que a query é eficiente (requer que 'dataExpiracao' esteja indexado, o Firebase faz isso automaticamente)
        .endAt(agora) 
        .once('value');
        
    let count = 0;
    
    if (snapshot.exists()) {
        const updates = {};
        
        // 4. Itera sobre os itens expirados e prepara a exclusão
        snapshot.forEach(childSnapshot => {
            // Define o valor do nó como 'null' para removê-lo
            updates[childSnapshot.key] = null; 
            count++;
        });

        // 5. Executa a exclusão em massa de todos os itens expirados.
        await historicoRef.update(updates);
        console.log(`Limpeza do Histórico: ${count} veículos expirados removidos.`);
    } else {
        console.log("Limpeza do Histórico: Nenhum veículo expirado encontrado.");
    }

    return null;
});